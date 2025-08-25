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

export const MODEL_CARDS = [
    {
        id: 'lightweight',
        name: 'Lightweight',
        description: 'For quick responses and simple tasks.',
        Icon: Feather,
        size: '639MB',
        modelId: 'unsloth/Qwen3-0.6B-GGUF',
        tag: 'https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf',
    },
    {
        id: 'balanced',
        name: 'Balanced',
        description: 'For a balance of speed and accuracy.',
        Icon: Scales,
        size: '1.83GB',
        modelId: 'unsloth/Qwen3-1.7B-GGUF',
        tag: 'https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q8_0.gguf',
    },
    {
        id: 'powerful',
        name: 'Powerful',
        description: 'Heavier models for the best accuracy.',
        Icon: Barbell,
        size: '2.09GB',
        modelId: 'unsloth/Llama-3.2-3B-Instruct-GGUF',
        tag: 'https://huggingface.co/unsloth/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_1.gguf',
    },
];

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