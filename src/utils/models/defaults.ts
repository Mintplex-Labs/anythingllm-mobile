import { Feather, Scales, Barbell } from "phosphor-react-native";
import * as RNFS from '@dr.pogodin/react-native-fs';

export type DefaultModel = {
    id: string;
    name: string;
    description: string;
    Icon: React.ElementType;
    size: string;
    modelId: string;
    tag: string;
    isPreset: boolean;
}

/**
 * Onboarding / "simple" presets. These are aliases for models that also live in
 * the full catalog (`defaultModels`) - they share the same modelId + download url
 * so a preset and its catalog entry resolve to the same file on disk. Both are
 * listed in the model picker; only the preset row uses the phosphor icon below.
 */
export const MODEL_CARDS = [
    {
        id: 'lightweight',
        name: 'Lightweight',
        description: 'For quick responses and simple tasks.',
        Icon: Feather,
        size: '812MB',
        modelId: 'unsloth/Qwen3.5-0.8B-GGUF',
        tag: 'https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q8_0.gguf',
    },
    {
        id: 'balanced',
        name: 'Balanced',
        description: 'For a balance of speed and accuracy.',
        Icon: Scales,
        size: '2.01GB',
        modelId: 'unsloth/Qwen3.5-2B-GGUF',
        tag: 'https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/main/Qwen3.5-2B-Q8_0.gguf',
    },
    {
        id: 'powerful',
        name: 'Powerful',
        description: 'Heavier models for the best accuracy.',
        Icon: Barbell,
        size: '3.53GB',
        modelId: 'unsloth/Qwen3.5-4B-GGUF',
        tag: 'https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q6_K.gguf',
    },
];

export const RERANKER_MODEL = {
    id: 'reranker',
    name: 'Tool Reranker',
    description: 'Cross-encoder reranker for intelligent tool selection.',
    size: '22.6MB',
    modelId: 'sinjab/ms-marco-MiniLM-L6-v2-Q8_0-GGUF',
    tag: 'https://huggingface.co/sinjab/ms-marco-MiniLM-L6-v2-Q8_0-GGUF/resolve/main/ms-marco-MiniLM-L6-v2-Q8_0.gguf',
}

export const EMBEDDING_MODEL = {
    id: 'default',
    name: 'Default',
    description: 'The default embedding model for AnythingLLM.',
    size: '84.1MB',

    // Nomic Embed Text works best, all the All-MiniLM-L6-v2 models are too compressed and suck.
    // https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF
    modelId: 'nomic-ai/nomic-embed-text-v1.5-GGUF',
    tag: 'https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q4_K_M.gguf',
}

/**
 * Resolves the destination path for a gguf model from a url
 * Typically this is a huggingface url
 * @param url - The url of the model
 * @returns The destination path for the model
 */
export function resolveDestinationPathFromGGUFUrl(url: string) {
    const splits = new URL(url).pathname.split('/');
    const creator = {
        creator: splits[1],
        model: splits[2],
        file: splits.slice(-1)[0],
    }
    return `${RNFS.DocumentDirectoryPath}/models/gguf/${creator.creator}/${creator.model}/${creator.file}`;
}

export default MODEL_CARDS;