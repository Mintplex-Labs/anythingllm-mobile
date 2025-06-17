import { EMBEDDING_MODEL, resolveDestinationPathFromGGUFUrl } from "@/utils/defaultModels";
import TextSplitter, { TextSplitterConfig } from "@/utils/TextSplitter";
import * as RNFS from '@dr.pogodin/react-native-fs';
import { initLlama, LlamaContext, NativeEmbeddingResult } from "llama.rn";
import { Platform } from "react-native";


export default class OnDeviceEmbedderProvider {
    private model = EMBEDDING_MODEL.modelId;
    private modelPath = resolveDestinationPathFromGGUFUrl(EMBEDDING_MODEL.tag);
    private keepAliveTimer: NodeJS.Timeout | null = null;
    private keepAliveInterval = 1000 * (60 * 3); // 3 minutes
    private llamaRnContext: LlamaContext | null = null;

    constructor() { }

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
            if (!!this.llamaRnContext) return true;
            if (!(await RNFS.exists(this.modelPath))) await this.downloadModel();

            this.llamaRnContext = await initLlama({
                model: this.modelPath,
                use_mlock: true,
                n_gpu_layers: Platform.OS === 'ios' ? 99 : 0,
                embedding: true,
            })

            this.log(`initialized with model ${this.model}`);
            return true;
        } catch (error) {
            console.error('Failed to initialize model:', error);
            throw error;
        }
    }

    private keepAlive() {
        if (this.keepAliveTimer) clearTimeout(this.keepAliveTimer);
        this.keepAliveTimer = setTimeout(() => {
            this.cleanup();
        }, this.keepAliveInterval);
    }


    private async unloadModel(): Promise<void> {
        this.log('Unloading model');
        if (this.llamaRnContext) await this.llamaRnContext.release();
        this.llamaRnContext = null;
    }

    private async wrapInKeepAlive(func: () => Promise<any>) {
        this.keepAlive();
        const result = await func();
        this.keepAlive();
        return result;
    }

    private async cleanup(): Promise<void> {
        this.log('Cleaning up OnDeviceEmbedderProvider');
        await this.unloadModel();
    }

    /**
     * Embeds a single text.
     * @param text - The text to embed.
     * @returns The embedding.
     */
    async embed(text: string) {
        return this.wrapInKeepAlive(async () => {
            await this.initialize();
            if (!this.llamaRnContext) throw new Error('OnDeviceEmbedderProvider::embed: could not initialize');

            this.keepAlive();
            const msgResult: NativeEmbeddingResult = await this.llamaRnContext.embedding(text);
            return msgResult.embedding;
        });
    }

    /**
     * Embeds a batch of texts.
     * @param texts - The texts to embed.
     */
    async embedBatch(texts: string[]) {
        let embeddings: number[][] = [];
        for (const text of texts) embeddings.push(await this.embed(text));
        return embeddings;
    }

    /**
     * Splits the document text into chunks and embeds them.
     * Returns an array of embeddings with their respective metadata.
     */
    async splitAndEmbed(documentText: string, options: TextSplitterConfig) {
        const textSplitter = new TextSplitter(options);
        const chunks = await textSplitter.splitText(documentText);
        this.log(`Split document into ${chunks.length} ~${chunks[0].length} character chunks`);

        const embeddings = await this.embedBatch(chunks);
        return embeddings.map((embedding, index) => ({
            embedding,
            metadata: {
                content: chunks[index]
            }
        }));
    }
}
