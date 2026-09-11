import { RERANKER_MODEL, resolveDestinationPathFromGGUFUrl } from "@/utils/models/defaults";
import * as RNFS from '@dr.pogodin/react-native-fs';
import { initLlama, LlamaContext } from "llama.rn";
import NetInfo from "@react-native-community/netinfo";
import { Alert } from "react-native";

type ToolDefinition = {
    type: 'function';
    function: {
        name: string;
        description?: string;
        parameters: {
            type: 'object';
            properties: { [key: string]: any };
            required: readonly string[];
        };
    };
};

type RerankResult = {
    tool: ToolDefinition;
    score: number;
    originalIndex: number;
};

type RerankerOptions = {
    /** User prompt to rank tools against */
    prompt: string;
    /** Tools to rerank */
    tools: ToolDefinition[];
    /** Max tools to return after reranking */
    topN?: number;
    /** Callback for UI status updates */
    onStatus?: (message: string) => void;
};

const LLAMA_POOLING_TYPE_RANK = 'rank' as const;

/**
 * Intelligent tool selection via cross-encoder reranking.
 *
 * Loads a small GGUF cross-encoder model (ms-marco-MiniLM-L6-v2, ~20 MB)
 * into llama.rn, scores each tool definition against the user prompt, and
 * returns the top-N most relevant tools. The model is loaded on demand and
 * released immediately after scoring to preserve device memory.
 */
export default class ToolReranker {
    static instance: ToolReranker;

    private modelPath = resolveDestinationPathFromGGUFUrl(RERANKER_MODEL.tag);

    /** On-device: rerank when more than this many tools are available */
    static ON_DEVICE_THRESHOLD = 4;
    /** Cloud/external: rerank when more than this many tools are available */
    static CLOUD_THRESHOLD = 10;

    constructor() {
        if (ToolReranker.instance) return ToolReranker.instance;
        ToolReranker.instance = this;
    }

    private log(text: string, ...args: any[]) {
        console.log(`\x1b[36m[ToolReranker]\x1b[0m ${text}`, ...args);
    }

    /**
     * Check whether the reranker model has been downloaded.
     */
    async isModelReady(): Promise<boolean> {
        return RNFS.exists(this.modelPath);
    }

    /**
     * Download the reranker model. Returns true on success.
     * If the user is on cellular, prompts for confirmation before downloading.
     */
    async downloadModel(options?: { silent?: boolean }): Promise<boolean> {
        try {
            if (await RNFS.exists(this.modelPath)) return true;

            const netState = await NetInfo.fetch();
            if (options?.silent) {
                // Silent mode: only download on WiFi, skip without prompting on cellular
                if (netState.type !== 'wifi') {
                    this.log('Skipping silent download - not on WiFi');
                    return false;
                }
            } else if (netState.type === 'cellular') {
                const confirmed = await new Promise<boolean>((resolve) => {
                    Alert.alert(
                        'Download Required',
                        `Intelligent tool selection requires a small model download (${RERANKER_MODEL.size}). You are on cellular data. Continue?`,
                        [
                            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                            { text: 'Download', onPress: () => resolve(true) },
                        ]
                    );
                });
                if (!confirmed) return false;
            }

            const directory = this.modelPath.split('/').slice(0, -1).join('/');
            await RNFS.mkdir(directory);
            this.log(`Downloading reranker model (${RERANKER_MODEL.size})...`);
            await RNFS.downloadFile({
                fromUrl: RERANKER_MODEL.tag,
                toFile: this.modelPath,
                progress: (res) => {
                    const pct = ((res.bytesWritten / res.contentLength) * 100).toFixed(0);
                    this.log(`Download progress: ${pct}%`);
                },
            }).promise;
            this.log('Reranker model downloaded');
            return true;
        } catch (error) {
            this.log('Failed to download reranker model', error);
            return false;
        }
    }

    /**
     * Convert a tool definition into a text document for the cross-encoder.
     * Mirrors the core app's approach: name + description + parameter descriptions.
     */
    private toolToDocument(tool: ToolDefinition): string {
        const fn = tool.function;
        const parts = [fn.name];
        if (fn.description) parts.push(fn.description);

        const props = fn.parameters?.properties;
        if (props) {
            for (const [key, schema] of Object.entries(props)) {
                const desc = schema?.description;
                if (desc) parts.push(`${key}: ${desc}`);
            }
        }

        // Truncate to keep the cross-encoder input short
        return parts.join(' - ').slice(0, 512);
    }

    /**
     * Load the model, rerank tools, then immediately unload.
     * Returns the top-N tools sorted by relevance, or all tools on failure.
     */
    async rerank({ prompt, tools, topN, onStatus }: RerankerOptions): Promise<ToolDefinition[]> {
        const effectiveTopN = topN ?? ToolReranker.ON_DEVICE_THRESHOLD;
        if (tools.length <= effectiveTopN) return tools;

        let context: LlamaContext | null = null;
        try {
            // Ensure model is available
            if (!(await this.isModelReady())) {
                onStatus?.('Downloading tool selection model');
                const downloaded = await this.downloadModel({ silent: false });
                if (!downloaded) {
                    this.log('Model not available, returning all tools');
                    return tools;
                }
            }

            onStatus?.('Selecting best tools');
            this.log(`Reranking ${tools.length} tools against prompt: "${prompt.slice(0, 100)}..."`);
            const startTime = Date.now();

            // Load the cross-encoder into a temporary context
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

            // Build documents from tool definitions
            const documents = tools.map((tool) => this.toolToDocument(tool));
            this.log('Tool documents:', documents.map((d, i) => `[${i}] ${d.slice(0, 80)}`));

            // Run cross-encoder reranking
            const rerankResults = await context.rerank(prompt, documents);
            const loadAndRankMs = Date.now() - startTime;

            // Sort by score descending and take top-N
            const scored: RerankResult[] = rerankResults.map((r) => ({
                tool: tools[r.index],
                score: r.score,
                originalIndex: r.index,
            }));
            scored.sort((a, b) => b.score - a.score);
            const selected = scored.slice(0, effectiveTopN);
            const removed = scored.slice(effectiveTopN);

            // Logging for empirical evaluation
            this.log(`Reranking completed in ${loadAndRankMs}ms`);
            this.log('--- Tool Reranking Results ---');
            for (const { tool, score } of scored) {
                this.log(`  ${score >= selected[selected.length - 1].score ? '✓' : '✗'} [${score.toFixed(4)}] ${tool.function.name}`);
            }
            this.log(`Selected ${selected.length}/${tools.length} tools`);
            this.log(`Removed tools: ${removed.map((r) => r.tool.function.name).join(', ') || 'none'}`);

            const originalTokenEstimate = documents.join(' ').length;
            const selectedDocs = selected.map((s) => this.toolToDocument(s.tool));
            const selectedTokenEstimate = selectedDocs.join(' ').length;
            this.log(`Estimated token savings: ${originalTokenEstimate} → ${selectedTokenEstimate} chars (~${((1 - selectedTokenEstimate / originalTokenEstimate) * 100).toFixed(0)}% reduction)`);

            return selected.map((s) => s.tool);
        } catch (error) {
            this.log('Reranking failed, returning all tools', error);
            return tools;
        } finally {
            // Always release the context to free memory
            if (context) {
                try {
                    await context.release();
                    this.log('Reranker context released');
                } catch (e) {
                    this.log('Failed to release reranker context', e);
                }
            }
        }
    }
}
