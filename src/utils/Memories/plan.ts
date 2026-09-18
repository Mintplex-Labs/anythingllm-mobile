/**
 * Pure planning + rendering for user-authored memories. No I/O lives here so the
 * placement rules can be unit tested and reasoned about on their own.
 *
 * Placement rule (see the module README in `index.ts`):
 *  - Global memories are always sent, in the system prompt.
 *  - Workspace memories that fit the remaining budget are also sent in the system prompt, since
 *    the set only changes when the user edits it and so keeps the cached prefix stable.
 *  - When the workspace set outgrows the budget only the ones relevant to the current prompt are
 *    sent, on the user message, so the system prompt stays byte-identical between turns.
 */

export type PlannableMemory = {
  uuid: string;
  content: string;
  embedding: number[] | null;
  createdAt: number;
};

export type MemoryPlan = {
  /** Memories rendered into the system prompt (global first, then workspace when they fit). */
  system: { global: PlannableMemory[]; workspace: PlannableMemory[] };
  /**
   * Memories that must be retrieved per prompt instead of sent every turn: the workspace set when it
   * outgrows the budget, plus any global memories the always-on block had no room for.
   */
  retrieval: { candidates: PlannableMemory[]; budgetTokens: number } | null;
  /** Global memories that did not fit the always-on block (they are still in `retrieval.candidates`). */
  dropped: PlannableMemory[];
};

/** Rough token estimate; matches the chars-per-token ratio used elsewhere for on-device budgets. */
export const CHARS_PER_TOKEN = 3.5;
/** Overhead per rendered bullet line ("- " and newline). */
const LINE_OVERHEAD_TOKENS = 2;
/** Overhead for the block heading lines. */
const BLOCK_OVERHEAD_TOKENS = 12;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateMemoryTokens(memory: Pick<PlannableMemory, 'content'>): number {
  return estimateTokens(memory.content) + LINE_OVERHEAD_TOKENS;
}

/**
 * Minimum room the retrieval path is given for a prompt's worth of memories, even when the
 * always-on set consumed the whole budget. Roughly two short memories.
 */
export const MIN_RETRIEVAL_BUDGET_TOKENS = 96;

/**
 * Decide where each memory goes for a given token budget.
 * `global` and `workspace` are expected oldest-first; that order is preserved so the rendered
 * block (and the cached prefix) does not reshuffle between turns.
 */
export function planMemories({
  global,
  workspace,
  budgetTokens,
}: {
  global: PlannableMemory[];
  workspace: PlannableMemory[];
  budgetTokens: number;
}): MemoryPlan {
  const plan: MemoryPlan = {
    system: { global: [], workspace: [] },
    retrieval: null,
    dropped: [],
  };
  if (!global.length && !workspace.length) return plan;

  let remaining = Math.max(0, budgetTokens) - BLOCK_OVERHEAD_TOKENS;

  // Global memories are facts the model must always know. Only when they alone overflow the budget
  // do the newest fall out of the always-on block (oldest kept first so established facts survive) -
  // those are then searched per prompt like an oversized workspace set instead of being lost.
  for (const memory of global) {
    const cost = estimateMemoryTokens(memory);
    if (cost <= remaining) {
      plan.system.global.push(memory);
      remaining -= cost;
    } else {
      plan.dropped.push(memory);
    }
  }

  const workspaceCost = workspace.reduce((sum, memory) => sum + estimateMemoryTokens(memory), 0) + BLOCK_OVERHEAD_TOKENS;
  if (workspace.length && workspaceCost <= remaining && !plan.dropped.length) {
    plan.system.workspace = [...workspace];
    return plan;
  }

  const candidates = [...plan.dropped, ...workspace];
  if (!candidates.length) return plan;
  plan.retrieval = {
    candidates,
    budgetTokens: Math.max(MIN_RETRIEVAL_BUDGET_TOKENS, remaining),
  };
  return plan;
}

/**
 * Keep the highest scoring memories that fit `budgetTokens`. `scored` must already be sorted
 * best-first and thresholded by the caller.
 */
export function fitScoredMemories<T extends Pick<PlannableMemory, 'content'>>(scored: T[], budgetTokens: number): T[] {
  const kept: T[] = [];
  let remaining = Math.max(0, budgetTokens) - BLOCK_OVERHEAD_TOKENS;
  for (const memory of scored) {
    const cost = estimateMemoryTokens(memory);
    if (cost > remaining) continue;
    kept.push(memory);
    remaining -= cost;
  }
  return kept;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

const bulletList = (memories: Pick<PlannableMemory, 'content'>[]) => memories.map((memory) => `- ${memory.content}`).join('\n');

/**
 * The block appended to the system prompt. Kept terse and free of instructions so small models
 * read it as background facts rather than a task. Returns `null` when there is nothing to render.
 */
export function renderSystemMemoryBlock({ global, workspace }: { global: Pick<PlannableMemory, 'content'>[]; workspace: Pick<PlannableMemory, 'content'>[] }): string | null {
  const sections: string[] = [];
  if (global.length) sections.push(`Facts about the user to keep in mind:\n${bulletList(global)}`);
  if (workspace.length) sections.push(`Notes for this workspace:\n${bulletList(workspace)}`);
  if (!sections.length) return null;
  return sections.join('\n\n');
}

/**
 * The block prepended to the user message for per-prompt retrieved memories. Mirrors the
 * `[CONTEXT_START]` framing used for RAG chunks so providers and history replay treat it alike.
 */
export function renderPromptMemoryBlock(memories: Pick<PlannableMemory, 'content'>[]): string | null {
  if (!memories.length) return null;
  return `[MEMORY_START]\nSaved notes relevant to this message:\n${bulletList(memories)}\n[MEMORY_END]`;
}
