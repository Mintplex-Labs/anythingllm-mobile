import { type DynamicChatMessage } from '@/screens/WorkspaceChat/ChatHistory';
import WorkspaceThread, { type ThreadContextSummary } from '@/database/models/WorkspaceThread';
import { parseThinkingParts } from '@/utils/chat';

/** Plain OpenAI-style chat message - the only shape the compactor needs from a provider. */
export type CompactionChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type ContextCompactorConfig = {
  /** Total tokens the model can see (prompt + reply). */
  contextWindow: number;
  /** Tokens the prompt may occupy, ie: `contextWindow` minus the room reserved for the reply. */
  promptBudget: number;
  /** Counts the tokens `messages` render to for the target model (ideally through its real chat template). */
  countTokens: (messages: CompactionChatMessage[]) => Promise<number>;
  /** Runs a short, tool-free completion and returns its text. */
  complete: (messages: CompactionChatMessage[], options: { maxTokens: number }) => Promise<string>;
  log?: (message: string, ...args: any[]) => void;
};

/**
 * The saved chat history split into the part represented by a summary and the part
 * that is still sent verbatim.
 */
export type ResolvedHistory = {
  /** Summary of the oldest chats, or null when everything is sent verbatim. */
  summary: string | null;
  /** How many chats (from the start of the thread) `summary` stands in for. */
  coveredCount: number;
  /** Chats to send verbatim, in order. */
  recent: DynamicChatMessage[];
  /** True when a stored summary no longer matched the saved chats and was discarded. */
  stale: boolean;
};

/**
 * Drops the middle of `text` so it is at most `maxChars` long, keeping the head and tail.
 * Used for tool results and single oversized messages that would otherwise blow the window.
 */
export function truncateMiddle(text: string, maxChars: number, headRatio: number = 0.7): string {
  if (!text || maxChars <= 0 || text.length <= maxChars) return text;
  const marker = '\n[...truncated to fit the context window...]\n';
  const room = Math.max(0, maxChars - marker.length);
  if (room < 32) return text.slice(0, maxChars);
  const head = Math.floor(room * headRatio);
  const tail = room - head;
  return `${text.slice(0, head)}${marker}${text.slice(text.length - tail)}`;
}

/**
 * Keeps a long thread inside a small context window by folding its oldest chats into a
 * rolling summary that is persisted on the thread (`WorkspaceThread.contextSummary`).
 *
 * Provider agnostic: the caller supplies the window size, a token counter and a
 * completion function, so any provider that knows its context window can use this.
 * Only the on-device provider does today.
 *
 * Flow per turn:
 *  1. `resolve()` checks the stored summary still lines up with the saved chats
 *     (deleting/retrying an earlier chat invalidates it) and returns summary + recent chats.
 *  2. The provider sends `summary` inside the system prompt and `recent` verbatim.
 *  3. After the reply, `compact()` runs in the background: once the verbatim history is
 *     using more than `HISTORY_TRIGGER_RATIO` of the prompt budget, the oldest chats are
 *     summarised (incrementally, on top of the previous summary) until the remainder is
 *     under `HISTORY_TARGET_RATIO`. The next prompt is already compacted when the user sends it.
 *
 * `compact()` is also safe to call inline before a prompt when history already overflows -
 * calls are serialised so a background run and an inline run never overlap.
 */
export default class ContextCompactor {
  /** Verbatim history may use this share of the prompt budget before compaction kicks in. */
  static HISTORY_TRIGGER_RATIO = 0.5;
  /** Compaction folds chats until the verbatim history is under this share of the prompt budget. */
  static HISTORY_TARGET_RATIO = 0.3;
  /** The newest chats are never summarised so the model always sees the immediate exchange verbatim. */
  static MIN_CHATS_KEPT_VERBATIM = 1;
  /** Bounds for the summary length (tokens) - it scales with the window (1/8th) between these. */
  static SUMMARY_MIN_TOKENS = 64;
  static SUMMARY_MAX_TOKENS = 256;

  private config: ContextCompactorConfig;
  /** In-flight compaction, if any. Later calls wait on it instead of running concurrently. */
  private pending: Promise<unknown> | null = null;

  constructor(config: ContextCompactorConfig) {
    this.config = config;
  }

  private log(message: string, ...args: any[]) {
    this.config.log?.(`[ContextCompactor] ${message}`, ...args);
  }

  get isRunning(): boolean {
    return this.pending !== null;
  }

  /** Max tokens the summary itself may take. */
  get summaryMaxTokens(): number {
    const scaled = Math.floor(this.config.contextWindow / 8);
    return Math.min(ContextCompactor.SUMMARY_MAX_TOKENS, Math.max(ContextCompactor.SUMMARY_MIN_TOKENS, scaled));
  }

  get triggerTokens(): number {
    return Math.floor(this.config.promptBudget * ContextCompactor.HISTORY_TRIGGER_RATIO);
  }

  get targetTokens(): number {
    return Math.floor(this.config.promptBudget * ContextCompactor.HISTORY_TARGET_RATIO);
  }

  static load(threadSlug: string): Promise<ThreadContextSummary | null> {
    return WorkspaceThread.getContextSummary(threadSlug);
  }

  static clear(threadSlug: string): Promise<boolean> {
    return WorkspaceThread.setContextSummary(threadSlug, null);
  }

  /**
   * Splits `history` into the chats a stored summary stands in for and the chats to send
   * verbatim. A summary only applies when the chat it ends on is still at the position it
   * was when the summary was written - anything else means history changed underneath it.
   */
  static resolve(history: DynamicChatMessage[], stored: ThreadContextSummary | null): ResolvedHistory {
    if (!stored?.summary || !stored.throughUuid || !stored.coveredCount) {
      return { summary: null, coveredCount: 0, recent: history, stale: false };
    }
    const index = history.findIndex((chat) => chat.uuid === stored.throughUuid);
    if (index === -1 || index !== stored.coveredCount - 1) {
      return { summary: null, coveredCount: 0, recent: history, stale: true };
    }
    return {
      summary: stored.summary,
      coveredCount: stored.coveredCount,
      recent: history.slice(stored.coveredCount),
      stale: false,
    };
  }

  /** Saved chats as user/assistant pairs (what the provider ultimately sends). */
  static toMessages(history: DynamicChatMessage[]): CompactionChatMessage[] {
    return history.flatMap((chat) => [
      { role: 'user' as const, content: String(chat.prompt ?? '') },
      { role: 'assistant' as const, content: String(chat.response?.textResponse ?? '') },
    ]);
  }

  /** Tokens the verbatim history alone would add to the prompt. */
  async historyTokens(history: DynamicChatMessage[]): Promise<number> {
    if (!history.length) return 0;
    return this.config.countTokens(ContextCompactor.toMessages(history));
  }

  /** Whether the verbatim history has grown past the trigger share of the prompt budget. */
  async shouldCompact(recent: DynamicChatMessage[]): Promise<boolean> {
    if (recent.length <= ContextCompactor.MIN_CHATS_KEPT_VERBATIM) return false;
    return (await this.historyTokens(recent)) > this.triggerTokens;
  }

  /**
   * Loads the stored summary, validates it against `history` and, when the verbatim
   * remainder is over the trigger (or `force` is set), folds the oldest chats into the
   * summary and persists it. Never throws - on failure the unchanged resolution is returned
   * so the caller can fall back to plain pruning.
   */
  compact({ threadSlug, history, force = false, trigger = 'unspecified' }: { threadSlug: string; history: DynamicChatMessage[]; force?: boolean; trigger?: string }): Promise<ResolvedHistory> {
    const run = (this.pending ?? Promise.resolve())
      .catch(() => null)
      .then(() => this.compactNow({ threadSlug, history, force, trigger }));
    this.pending = run;
    run.finally(() => { if (this.pending === run) this.pending = null; }).catch(() => null);
    return run;
  }

  private async compactNow({ threadSlug, history, force, trigger }: { threadSlug: string; history: DynamicChatMessage[]; force: boolean; trigger: string }): Promise<ResolvedHistory> {
    const stored = await ContextCompactor.load(threadSlug);
    let resolved = ContextCompactor.resolve(history, stored);
    if (resolved.stale) {
      this.log(`Stored summary for thread ${threadSlug} covered ${stored?.coveredCount} chat(s) ending at ${stored?.throughUuid}, but that chat is no longer at that position (deleted/retried/forked) - discarding it`);
      await ContextCompactor.clear(threadSlug);
    }

    try {
      const remaining = [...resolved.recent];
      let remainingTokens = await this.historyTokens(remaining);
      const startingTokens = remainingTokens;
      const { contextWindow, promptBudget } = this.config;
      const usage = `${resolved.recent.length} verbatim chat(s) = ${startingTokens} tokens, ${Math.round((startingTokens / promptBudget) * 100)}% of the ${promptBudget} token prompt budget (${contextWindow} token window, trigger ${this.triggerTokens})`;

      if (!force && remainingTokens <= this.triggerTokens) {
        this.log(`No compaction needed for thread ${threadSlug} [${trigger}]: ${usage}`);
        return resolved;
      }

      const reason = force
        ? `forced by caller`
        : `verbatim history would take ${startingTokens} of the ${promptBudget} prompt tokens, leaving too little room before the ${contextWindow} token window overflows`;
      this.log(`Compacting thread ${threadSlug} [${trigger}] because ${reason}. ${usage}`);

      // Peel the oldest chats off until what is left fits the target share of the budget.
      const toFold: DynamicChatMessage[] = [];
      while (remaining.length > ContextCompactor.MIN_CHATS_KEPT_VERBATIM && remainingTokens > this.targetTokens) {
        toFold.push(remaining.shift()!);
        remainingTokens = await this.historyTokens(remaining);
      }
      if (!toFold.length) {
        this.log(`Nothing to fold for thread ${threadSlug} - only ${remaining.length} chat(s) remain and the newest ${ContextCompactor.MIN_CHATS_KEPT_VERBATIM} is always kept verbatim`);
        return resolved;
      }

      this.log(`Folding the ${toFold.length} oldest chat(s) into the summary for thread ${threadSlug}: history goes ${startingTokens} -> ${remainingTokens} tokens (target <= ${this.targetTokens}), ${remaining.length} chat(s) stay verbatim${resolved.summary ? `, extending an existing summary of ${resolved.coveredCount} chat(s)` : ''}`);
      let summary = resolved.summary;
      let coveredCount = resolved.coveredCount;
      const queue = [...toFold];
      while (queue.length) {
        const batch = await this.takeBatchThatFits(summary, queue);
        summary = await this.summarize(summary, batch);
        coveredCount += batch.length;
      }
      if (!summary) throw new Error('Summarisation returned no text');

      const last = toFold[toFold.length - 1];
      if (!last.uuid) throw new Error('Cannot persist a summary for a chat without a uuid');
      await WorkspaceThread.setContextSummary(threadSlug, { summary, throughUuid: last.uuid, coveredCount, updatedAt: Date.now() });
      const summaryTokens = await this.config.countTokens([{ role: 'system', content: summary }]);
      this.log(`Compaction done for thread ${threadSlug}: summary now covers ${coveredCount} chat(s) in ~${summaryTokens} tokens (cap ${this.summaryMaxTokens}); next prompt sends summary + ${remaining.length} verbatim chat(s) = ~${summaryTokens + remainingTokens} tokens instead of ${startingTokens}`);
      resolved = { summary, coveredCount, recent: remaining, stale: false };
      return resolved;
    } catch (error) {
      this.log('Compaction failed - history will be pruned instead', error);
      return resolved;
    }
  }

  /**
   * Removes and returns the longest run of chats from the front of `queue` whose
   * summarisation prompt fits the budget. A single chat too large on its own is
   * truncated (middle removed) so progress is always made.
   */
  private async takeBatchThatFits(previousSummary: string | null, queue: DynamicChatMessage[]): Promise<DynamicChatMessage[]> {
    const budget = Math.max(64, this.config.promptBudget - this.summaryMaxTokens);
    const fits = async (chats: DynamicChatMessage[]) => (await this.config.countTokens(this.summaryPrompt(previousSummary, chats))) <= budget;

    const batch: DynamicChatMessage[] = [];
    while (queue.length && (await fits([...batch, queue[0]]))) batch.push(queue.shift()!);
    if (batch.length) return batch;

    // The oldest chat alone overflows the summariser - shrink its text until it fits.
    let chat = { ...queue.shift()! };
    let maxChars = Math.max(200, Math.floor((String(chat.prompt ?? '').length + String(chat.response?.textResponse ?? '').length) / 2));
    for (let attempt = 0; attempt < 6; attempt++) {
      chat = {
        ...chat,
        prompt: truncateMiddle(String(chat.prompt ?? ''), maxChars),
        response: { ...(chat.response as any), textResponse: truncateMiddle(String(chat.response?.textResponse ?? ''), maxChars) },
      };
      if (await fits([chat])) break;
      maxChars = Math.max(100, Math.floor(maxChars / 2));
    }
    return [chat];
  }

  private summaryPrompt(previousSummary: string | null, chats: DynamicChatMessage[]): CompactionChatMessage[] {
    const maxWords = Math.max(40, Math.floor(this.summaryMaxTokens * 0.7));
    const transcript = chats
      .map((chat) => `User: ${String(chat.prompt ?? '').trim()}\nAssistant: ${String(chat.response?.textResponse ?? '').trim()}`)
      .join('\n\n');
    return [
      {
        role: 'system',
        content: `You summarise conversations so they can be continued later. Write one plain-text summary of at most ${maxWords} words. Keep the user's goals, decisions made, important facts, names, numbers, and any open questions. Do not add commentary, headings, or a preamble - output only the summary.`,
      },
      {
        role: 'user',
        content: `${previousSummary ? `Summary so far:\n${previousSummary}\n\n` : ''}Conversation to add:\n${transcript}\n\nUpdated summary:`,
      },
    ];
  }

  private async summarize(previousSummary: string | null, chats: DynamicChatMessage[]): Promise<string> {
    // Reasoning models may think before answering - give them room, then strip it.
    const raw = await this.config.complete(this.summaryPrompt(previousSummary, chats), { maxTokens: this.summaryMaxTokens * 2 });
    const { nonThinkingText } = parseThinkingParts(raw);
    const text = (nonThinkingText || raw).replace(/^(updated )?summary:\s*/i, '').trim();
    if (!text) throw new Error('Summarisation returned no text');
    // Hard character guard in case the model ignored the word limit (~4 chars/token).
    return truncateMiddle(text, this.summaryMaxTokens * 5, 0.85);
  }
}
