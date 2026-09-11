import { RERANKER_MODEL, resolveDestinationPathFromGGUFUrl } from "@/utils/models/defaults";
import * as RNFS from '@dr.pogodin/react-native-fs';
import { initLlama, LlamaContext } from "llama.rn";
import type { SemanticSearchResult } from "@/utils/VectorDB";

const LLAMA_POOLING_TYPE_RANK = 'rank' as const;

/**
 * Reranks document chunks from vector search using a cross-encoder model.
 * Uses the same ms-marco-MiniLM-L6-v2 GGUF model as tool reranking.
 *
 * Flow: wider vector search → cross-encoder rerank → topK results.
 * Falls back gracefully when the model isn't downloaded yet.
 */
export default class DocumentReranker {
  static instance: DocumentReranker;

  private modelPath = resolveDestinationPathFromGGUFUrl(RERANKER_MODEL.tag);

  constructor() {
    if (DocumentReranker.instance) return DocumentReranker.instance;
    DocumentReranker.instance = this;
  }

  private log(text: string, ...args: any[]) {
    console.log(`\x1b[35m[DocumentReranker]\x1b[0m ${text}`, ...args);
  }

  async isModelReady(): Promise<boolean> {
    return RNFS.exists(this.modelPath);
  }

  /**
   * Calculate how many results to fetch from vector search before reranking.
   * Mirrors the core app: 10% of total embeddings, clamped to [10, 50].
   */
  static searchLimit(totalEmbeddings: number): number {
    return Math.max(10, Math.min(50, Math.ceil(totalEmbeddings * 0.1)));
  }

  /**
   * Rerank semantic search results against the user's query using the cross-encoder.
   * Returns topK results sorted by rerank score, preserving original scores for threshold filtering.
   */
  async rerank(
    query: string,
    results: SemanticSearchResult[],
    topK: number,
  ): Promise<(SemanticSearchResult & { rerankScore: number })[]> {
    if (results.length === 0) return [];
    if (results.length <= topK) {
      return results.map(r => ({ ...r, rerankScore: 1 - r.score }));
    }

    let context: LlamaContext | null = null;
    try {
      if (!(await this.isModelReady())) {
        this.log('Model not available, skipping rerank');
        return results.slice(0, topK).map(r => ({ ...r, rerankScore: 1 - r.score }));
      }

      this.log(`Reranking ${results.length} chunks against query: "${query.slice(0, 80)}..."`);
      const startTime = Date.now();

      context = await initLlama({
        model: this.modelPath,
        embedding: true,
        pooling_type: LLAMA_POOLING_TYPE_RANK,
        n_ctx: 512,
        n_batch: 512,
        n_ubatch: 512,
        use_mlock: true,
        use_mmap: true,
        n_gpu_layers: 0,
      });

      const documents = results.map(r =>
        String(r.metadata.content ?? '').slice(0, 512)
      );
      const rerankResults = await context.rerank(query, documents);
      const elapsed = Date.now() - startTime;

      const scored = rerankResults.map(r => ({
        ...results[r.index],
        rerankScore: r.score,
      }));
      scored.sort((a, b) => b.rerankScore - a.rerankScore);
      const selected = scored.slice(0, topK);

      this.log(`Reranked ${results.length} → ${selected.length} chunks in ${elapsed}ms`);
      this.log('Scores:', selected.map(s =>
        `[rerank=${s.rerankScore.toFixed(4)} cosine=${(1 - s.score).toFixed(4)}] ${String(s.metadata.name ?? '').slice(0, 40)}`
      ).join('\n  '));

      return selected;
    } catch (error) {
      this.log('Reranking failed, falling back to vector search order', error);
      return results.slice(0, topK).map(r => ({ ...r, rerankScore: 1 - r.score }));
    } finally {
      if (context) {
        try {
          await context.release();
          this.log('Context released');
        } catch (e) {
          this.log('Failed to release context', e);
        }
      }
    }
  }
}
