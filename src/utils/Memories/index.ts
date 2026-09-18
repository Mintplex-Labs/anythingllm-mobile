import Memory, { type MemoryScope, type MemoryType } from '@/database/models/Memory';
import uiStore from '@/store/UIStore';
import getEmbedder from '@/utils/Embedder';
import OnDeviceEmbedderProvider from '@/utils/Embedder/onDevice';
import DocumentReranker from '@/utils/DocumentReranker';
import Telemetry from '@/utils/Telemetry';
import {
  cosineSimilarity,
  fitScoredMemories,
  planMemories,
  renderPromptMemoryBlock,
  renderSystemMemoryBlock,
  type MemoryPlan,
} from './plan';

export type MemorySettings = { enabled: boolean };
export const DEFAULT_MEMORY_SETTINGS: MemorySettings = { enabled: false };

/** Emitted on `uiStore.emitter` whenever a memory is created, edited or removed. Payload: `{ scope, workspaceSlug }`. */
export const MEMORIES_CHANGED_EVENT = 'memoriesChanged';

/** What `forPrompt` hands the provider: already rendered, ready to drop into the messages. */
export type PromptMemories = {
  /** Block appended to the system prompt (global + workspace memories that fit), or `null`. */
  systemBlock: string | null;
  /** Block prepended to the user message with per-prompt retrieved workspace memories, or `null`. */
  promptBlock: string | null;
  /** How many memories went where - for logs and status lines. */
  counts: { system: number; prompt: number; dropped: number };
};

const EMPTY_PROMPT_MEMORIES: PromptMemories = { systemBlock: null, promptBlock: null, counts: { system: 0, prompt: 0, dropped: 0 } };

/**
 * User-authored memory. Nothing here is inferred by a model: the user types each memory, picks
 * whether it is global (about them - name, job, preferences) or scoped to one workspace, and can
 * switch the whole feature off, in which case no memory touches a prompt.
 *
 * Placement is decided per prompt by `planMemories` with a provider supplied token budget:
 *  - global memories always ride in the system prompt;
 *  - workspace memories join them while the set fits the budget (stable prefix, no per-turn work);
 *  - once the workspace set outgrows the budget (or global memories alone overflow it) only the
 *    memories relevant to the prompt are retrieved (cosine over stored embeddings, cross-encoder
 *    rerank when available) and prepended to the user message so the system prompt - and any
 *    provider prompt cache - stays untouched.
 *
 * Embeddings are computed on save when the on-device embedder is already downloaded and are
 * otherwise backfilled the first time retrieval actually needs them. Storage is plain SQLite
 * (see `database/models/Memory`) - nothing is created on the device until the first memory is saved.
 */
export default class MemoryManager {
  /** Cosine floor for a workspace memory to be considered for a prompt. Embeddings are nomic query/document pairs. */
  static RETRIEVAL_MIN_SIMILARITY = 0.55;
  /** Max memories the retrieval path will ever attach to one prompt (before the token budget trims further). */
  static RETRIEVAL_TOP_K = 4;
  /** Prompts shorter than this are too vague to retrieve against. */
  static RETRIEVAL_MIN_PROMPT_LENGTH = 8;

  static log(text: string, ...args: any[]) {
    console.log(`\x1b[36m[MemoryManager]\x1b[0m ${text}`, ...args);
  }

  // ---------------------------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------------------------

  static async getSettings(): Promise<MemorySettings> {
    const stored = await uiStore.getFromStorage<Partial<MemorySettings>>('memories', DEFAULT_MEMORY_SETTINGS);
    return { ...DEFAULT_MEMORY_SETTINGS, ...(stored ?? {}) };
  }

  static async isEnabled(): Promise<boolean> {
    return (await this.getSettings()).enabled;
  }

  static async setEnabled(enabled: boolean): Promise<MemorySettings> {
    const settings = { ...(await this.getSettings()), enabled };
    await uiStore.setToStorage('memories', settings);
    this.log(`memories ${enabled ? 'enabled' : 'disabled'}`);
    return settings;
  }

  // ---------------------------------------------------------------------------------------------
  // CRUD (used by the manage-memories sheet)
  // ---------------------------------------------------------------------------------------------

  static list(workspaceSlug: string | null) {
    return Memory.forWorkspace(workspaceSlug);
  }

  static async add({ content, scope, workspaceSlug = null }: { content: string; scope: MemoryScope; workspaceSlug?: string | null }): Promise<MemoryType> {
    const memory = await Memory.create({ content, scope, workspaceSlug });
    Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.MEMORY_SAVED, { scope });
    this.emitChanged(memory);
    this.embedIfCheap(memory).catch(() => {});
    return memory;
  }

  static async update(uuid: string, content: string): Promise<MemoryType | null> {
    const memory = await Memory.updateContent(uuid, content);
    if (!memory) return null;
    this.emitChanged(memory);
    this.embedIfCheap(memory).catch(() => {});
    return memory;
  }

  static async remove(uuid: string): Promise<boolean> {
    const existing = await Memory.findByUuid(uuid);
    const removed = await Memory.deleteByUuid(uuid);
    if (removed && existing) this.emitChanged(existing);
    return removed;
  }

  private static emitChanged(memory: Pick<MemoryType, 'scope' | 'workspaceSlug'>) {
    uiStore.emitter.emit(MEMORIES_CHANGED_EVENT, { scope: memory.scope, workspaceSlug: memory.workspaceSlug });
  }

  // ---------------------------------------------------------------------------------------------
  // Embedding
  // ---------------------------------------------------------------------------------------------

  /**
   * Embed a memory on save, but only when the embedder is already on the device. Saving a note
   * must never kick off an 84MB download - retrieval backfills missing vectors when it needs them.
   */
  private static async embedIfCheap(memory: MemoryType): Promise<void> {
    if (!(await OnDeviceEmbedderProvider.isModelDownloaded())) {
      this.log(`embedder not downloaded - memory ${memory.uuid} will be embedded on first use`);
      return;
    }
    await this.embed(memory);
  }

  private static async embed(memory: MemoryType): Promise<number[] | null> {
    try {
      const embedding = await getEmbedder('native').embed(memory.content, 'embed_document');
      if (!embedding?.length) return null;
      await Memory.setEmbedding(memory.uuid, embedding);
      this.log(`embedded memory ${memory.uuid} (${embedding.length} dims): "${memory.content.slice(0, 60)}"`);
      return embedding;
    } catch (error) {
      this.log(`failed to embed memory ${memory.uuid}`, error);
      return null;
    }
  }

  /** Ensure every candidate has a vector, embedding the ones that were saved before the embedder existed. */
  private static async backfillEmbeddings(memories: MemoryType[]): Promise<MemoryType[]> {
    const out: MemoryType[] = [];
    for (const memory of memories) {
      if (memory.embedding?.length) {
        out.push(memory);
        continue;
      }
      const embedding = await this.embed(memory);
      if (embedding) out.push({ ...memory, embedding });
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------
  // Prompt assembly
  // ---------------------------------------------------------------------------------------------

  /**
   * Everything a provider needs to inject memories for one prompt. Cheap in the common case: one
   * SQLite read and string concatenation. The embedder and reranker only run when the workspace
   * set has outgrown the budget.
   *
   * @param budgetTokens - tokens the always-on memory block may take in the system prompt. Providers
   *   size this to their window (see `BaseOpenAILikeProvider.memoryTokenBudget`).
   */
  static async forPrompt({
    workspaceSlug,
    userPrompt,
    budgetTokens,
    onStatus,
  }: {
    workspaceSlug: string | null;
    userPrompt: string;
    budgetTokens: number;
    onStatus?: (status: string) => void;
  }): Promise<PromptMemories> {
    try {
      if (!(await this.isEnabled())) return EMPTY_PROMPT_MEMORIES;
      const { global, workspace } = await Memory.forWorkspace(workspaceSlug);
      if (!global.length && !workspace.length) return EMPTY_PROMPT_MEMORIES;

      const plan = planMemories({ global, workspace, budgetTokens });
      const retrieved = plan.retrieval ? await this.retrieve(plan, userPrompt, onStatus) : [];

      const systemBlock = renderSystemMemoryBlock(plan.system);
      const promptBlock = renderPromptMemoryBlock(retrieved);
      const counts = {
        system: plan.system.global.length + plan.system.workspace.length,
        prompt: retrieved.length,
        dropped: plan.dropped.length,
      };
      this.log(`memories for prompt`, { ...counts, budgetTokens, retrievalMode: !!plan.retrieval });
      return { systemBlock, promptBlock, counts };
    } catch (error) {
      this.log('failed to assemble memories - sending prompt without them', error);
      return EMPTY_PROMPT_MEMORIES;
    }
  }

  /**
   * Per-prompt retrieval over the memories that did not fit the always-on block.
   * Cosine over the stored embeddings picks the candidates, the cross-encoder (when downloaded)
   * orders them, and the token budget trims the tail. Never triggers the embedder download: a chat
   * turn must not stall on an 84MB fetch, so without the model the prompt simply goes out without them.
   */
  private static async retrieve(plan: MemoryPlan, userPrompt: string, onStatus?: (status: string) => void): Promise<MemoryType[]> {
    if (!plan.retrieval) return [];
    if (userPrompt.trim().length < this.RETRIEVAL_MIN_PROMPT_LENGTH) return [];
    if (!(await OnDeviceEmbedderProvider.isModelDownloaded())) {
      this.log(`embedder not downloaded - skipping retrieval over ${plan.retrieval.candidates.length} memories`);
      return [];
    }

    onStatus?.('Recalling workspace notes');
    const candidates = await this.backfillEmbeddings(plan.retrieval.candidates as MemoryType[]);
    if (!candidates.length) return [];

    const queryVector = await getEmbedder('native').embed(userPrompt, 'query');
    if (!queryVector?.length) return [];

    const all = candidates
      .map((memory) => ({ memory, similarity: cosineSimilarity(queryVector, memory.embedding as number[]) }))
      .sort((a, b) => b.similarity - a.similarity);
    this.log(
      `retrieval for "${userPrompt.slice(0, 50)}..." (floor ${this.RETRIEVAL_MIN_SIMILARITY}):\n  ` +
      all.map(({ memory, similarity }) => `[${similarity.toFixed(3)}${similarity >= this.RETRIEVAL_MIN_SIMILARITY ? ' ✓' : '  '}] ${memory.content.slice(0, 60)}`).join('\n  '),
    );
    const scored = all.filter(({ similarity }) => similarity >= this.RETRIEVAL_MIN_SIMILARITY);
    if (!scored.length) {
      this.log('no workspace memory cleared the similarity floor for this prompt');
      return [];
    }

    let ordered = scored.map(({ memory }) => memory);
    const reranker = new DocumentReranker();
    if (ordered.length > 1 && (await reranker.isModelReady())) {
      const reranked = await reranker.rerank(
        userPrompt,
        scored.map(({ memory, similarity }) => ({ id: 0, score: 1 - similarity, metadata: { content: memory.content, uuid: memory.uuid } })),
        this.RETRIEVAL_TOP_K,
      );
      const byUuid = new Map(ordered.map((memory) => [memory.uuid, memory]));
      ordered = reranked.map((r) => byUuid.get(String(r.metadata.uuid))).filter((m): m is MemoryType => !!m);
    } else {
      ordered = ordered.slice(0, this.RETRIEVAL_TOP_K);
    }

    const kept = fitScoredMemories(ordered, plan.retrieval.budgetTokens);
    this.log(`attaching ${kept.length} of ${scored.length} candidate memories (budget ${plan.retrieval.budgetTokens} tokens):\n  ` + kept.map((m) => `- ${m.content.slice(0, 60)}`).join('\n  '));
    return kept;
  }
}
