import { EMBEDDING_MODEL, resolveDestinationPathFromGGUFUrl } from "@/utils/models/defaults";
import TextSplitter, { TextSplitterConfig } from "@/utils/TextSplitter";
import * as RNFS from '@dr.pogodin/react-native-fs';
import { initLlama, LlamaContext, NativeEmbeddingResult } from "llama.rn";

type EmbedderPrefixType = 'query' | 'embed_document';

/**
 * On-device text embedder backed by llama.rn (llama.cpp) running the
 * nomic-embed-text-v1.5 GGUF on the CPU.
 */
export default class OnDeviceEmbedderProvider {
    static instance: OnDeviceEmbedderProvider;

    /**
     * nomic-embed-text-v1.5 was trained with a 2048 token window (8192 with rope scaling).
     * Our chunks are far smaller than this. For non-causal embedding models llama.cpp
     * requires the whole input to fit in a single ubatch, so batch sizes match n_ctx.
     */
    private CONTEXT_LENGTH = 2048;

    /**
     * According to the llama.cpp documentation:
     * -1: no normalization (default)
     * 0: max absolute int16
     * 1: taxicab (L1)
     * 2: euclidean (L2)
     * >2: p-norm
     */
    private EMBEDDING_NORMALIZATION = -1;
    private EMBED_PREFIXES = {
        // For nomic-embed-text-v1.5-GGUF it has task prefixes for the different tasks.
        // https://huggingface.co/nomic-ai/nomic-embed-text-v1.5
        query: 'search_query: ',
        embed_document: 'search_document: ',
    }

    private _isWorking: boolean = false;
    private model = EMBEDDING_MODEL.modelId;
    private modelPath = resolveDestinationPathFromGGUFUrl(EMBEDDING_MODEL.tag);
    private keepAliveTimer: ReturnType<typeof setTimeout> | null = null;
    private keepAliveInterval = 1000 * (60 * 3); // 3 minutes
    private context: LlamaContext | null = null;
    private initializing: Promise<boolean> | null = null;

    // Singleton, there are no props so nothing to ever reload.
    // Just keep the singleton instance alive.
    constructor() {
        if (!OnDeviceEmbedderProvider.instance) OnDeviceEmbedderProvider.instance = this;
        return OnDeviceEmbedderProvider.instance;
    }

    private log(text: string, ...args: any[]) {
        console.log(`\x1b[35m[OnDeviceEmbedderProvider]\x1b[0m ${text}`, ...args);
    }

    private async downloadModel() {
        try {
            this.log('Downloading embedding model now to save time later...');
            const fileExists = await RNFS.exists(this.modelPath);
            if (fileExists) {
                this.log('Model already exists!');
                return true;
            } else {
                const directory = this.modelPath.split('/').slice(0, -1).join('/');
                this.log('Creating directory', directory);
                await RNFS.mkdir(directory);
            }

            return RNFS.downloadFile({
                fromUrl: EMBEDDING_MODEL.tag,
                toFile: this.modelPath,
                progress: (res) => {
                    const progress = (res.bytesWritten / res.contentLength) * 100;
                    this.log('progress', progress);
                }
            }).promise.then(() => true).catch(() => false);
        } catch (error) {
            this.log('downloadEmbeddingModel:error', error)
            return false;
        }
    }

    /**
     * Loads the embedding model. Concurrent callers share the same in-flight load
     * so a burst of chunks never creates more than one context.
     */
    private async initialize(): Promise<boolean> {
        if (this.context) return true;
        if (this.initializing) return this.initializing;

        this.initializing = (async () => {
            try {
                if (!(await RNFS.exists(this.modelPath))) await this.downloadModel();
                this.context = await initLlama({
                    model: this.modelPath,
                    embedding: true,
                    embd_normalize: this.EMBEDDING_NORMALIZATION,
                    n_ctx: this.CONTEXT_LENGTH,
                    n_batch: this.CONTEXT_LENGTH,
                    n_ubatch: this.CONTEXT_LENGTH,
                    use_mlock: true,
                    use_mmap: true,
                    n_gpu_layers: 0, // CPU only
                });
                this.log(`${this.model} loaded`);
                return true;
            } catch (error) {
                console.error('Failed to initialize model:', error);
                throw error;
            } finally {
                this.initializing = null;
            }
        })();
        return this.initializing;
    }

    private keepAlive() {
        if (this.keepAliveTimer) clearTimeout(this.keepAliveTimer);
        this.keepAliveTimer = setTimeout(() => {
            if (!this._isWorking) this.cleanup();
            else {
                /**
                 * If we are still working we cannot unload the model
                 * so we reset the keep alive timer. This is unbounded and will
                 * keep the model loaded for as long as we are working (could be forever!)
                 * TODO: implement a max iteration count to prevent infinite loops to force unload the model
                 * in case the user is stuck in a loaded state to free up memory.
                 */
                this.log('Cannot cleanup, still working...');
                this.keepAliveTimer = setTimeout(() => this.keepAlive(), this.keepAliveInterval);
            }
        }, this.keepAliveInterval);
    }

    private async unloadModel(): Promise<void> {
        if (this.keepAliveTimer) {
            clearTimeout(this.keepAliveTimer);
            this.keepAliveTimer = null;
        }
        if (!this.context) return;
        this.log('Unloading model');
        const context = this.context;
        this.context = null;
        await context.release();
    }

    /**
     * Wraps a function in a keep alive mechanism. that will allow us to keep extending the keep alive timer
     * for as long as any interations are happening.
     * @param func - The function to wrap.
     * @returns The result of the function.
     */
    private async wrapInKeepAlive(func: () => Promise<any>) {
        try {
            this._isWorking = true;
            this.keepAlive();
            return await func();
        } catch (error) {
            this.log('error running function', error);
        } finally {
            this._isWorking = false;
        }
    }

    /**
     * Cleans up the embedder.
     */
    async cleanup(): Promise<void> {
        this.log('Cleaning up!');
        await this.unloadModel();
    }

    /**
     * Embeds a single text.
     * @param text - The text to embed.
     * @returns The embedding.
     */
    async embed(text: string, as: 'query' | 'embed_document' = 'query') {
        return this.wrapInKeepAlive(async () => {
            await this.initialize();
            if (!this.context) throw new Error('OnDeviceEmbedderProvider::embed: could not initialize');

            this.keepAlive();
            const prefixedText = `${this.EMBED_PREFIXES[as]}${text}`;
            this.log(`Embedding text with prefix: ${prefixedText}`);
            const msgResult: NativeEmbeddingResult = await this.context.embedding(prefixedText, { embd_normalize: this.EMBEDDING_NORMALIZATION });
            return msgResult.embedding;
        });
    }

    /**
     * Embeds a batch of texts.
     * @param texts - The texts to embed.
     */
    async embedBatch(texts: string[], as: EmbedderPrefixType = 'query') {
        let embeddings: number[][] = [];
        for (const text of texts) embeddings.push(await this.embed(text, as));
        return embeddings;
    }

    /**
     * Splits the document text into chunks and embeds them.
     * Returns an array of embeddings with their respective metadata.
     *
     * Assumes this is a document that is being embedded for semantic search.
     */
    async splitAndEmbed(documentText: string, options: TextSplitterConfig, as: EmbedderPrefixType = 'embed_document') {
        const textSplitter = new TextSplitter(options);
        let chunks = await textSplitter.splitText(documentText);
        this.log(`Split document into ${chunks.length} ~${chunks[0].length} character chunks`);

        const embeddings = await this.embedBatch(chunks, as);
        return embeddings.map((embedding, index) => ({
            embedding,
            metadata: {
                content: chunks[index]
            }
        }));
    }
}
