import { EMBEDDING_MODEL, resolveDestinationPathFromGGUFUrl } from "@/utils/models/defaults";
import TextSplitter, { TextSplitterConfig } from "@/utils/TextSplitter";
import * as RNFS from '@dr.pogodin/react-native-fs';
import { NativeEmbeddingResult, CactusLM } from "cactus-react-native";
import { Platform } from "react-native";

type EmbedderPrefixType = 'query' | 'embed_document';

/**
 * The is a known bug with the on device embedder.
 * - When you send a query to the embedder, it will return a vector that is ok.
 * - Sending the EXACT SAME query again will return a different vector.
 * - Sending a different query will return a different vector.
 * - Sending the original query again will return the original vector from the first time.
 * 
 * Seeing this is a known bug with the on device embedder. Not a bug with the model.
 * The likelyhood that the same query is sent twice is very low, but it is something to be aware of.
 * We could track the last query vector and compare it to the new query vector and unload the model if they are different
 * before sending to semantic search, but that is a lot of overhead and we are not sure if it is worth it.
 */
export default class OnDeviceEmbedderProvider {
    static instance: OnDeviceEmbedderProvider;

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
    private keepAliveTimer: NodeJS.Timeout | null = null;
    private keepAliveInterval = 1000 * (60 * 3); // 3 minutes
    private cactusLmContext: CactusLM | null = null;

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

    private async initialize(): Promise<boolean> {
        try {
            if (!!this.cactusLmContext) return true;
            if (!(await RNFS.exists(this.modelPath))) await this.downloadModel();

            this.cactusLmContext = await CactusLM.init({
                model: this.modelPath,
                n_gpu_layers: Platform.OS === 'ios' ? 99 : 0,
                embedding: true,
            }).then(result => result.lm)
            return true;
        } catch (error) {
            console.error('Failed to initialize model:', error);
            throw error;
        }
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
        this.log('Unloading model');
        if (this.cactusLmContext) await this.cactusLmContext.release();
        this.cactusLmContext = null;
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
            if (!this.cactusLmContext) throw new Error('OnDeviceEmbedderProvider::embed: could not initialize');

            this.keepAlive();
            const prefixedText = `${this.EMBED_PREFIXES[as]}${text}`;
            this.log(`Embedding text with prefix: ${prefixedText}`);
            const msgResult: NativeEmbeddingResult = await this.cactusLmContext.embedding(prefixedText, { embd_normalize: this.EMBEDDING_NORMALIZATION });
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
