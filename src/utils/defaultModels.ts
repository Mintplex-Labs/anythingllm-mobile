import { Feather, Scales, Barbell } from "phosphor-react-native";
import * as RNFS from '@dr.pogodin/react-native-fs';

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
        size: '1.5GB',
        modelId: 'unsloth/gemma-3-1b-it-GGUF',
        tag: 'https://huggingface.co/unsloth/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-Q8_0.gguf',
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

export function resolveDestinationPathFromGGUFUrl(url: string) {
    const splits = new URL(url).pathname.split('/');
    const creator = {
        creator: splits[1],
        model: splits[2],
        file: splits.slice(-1)[0],
    }
    return `${RNFS.DocumentDirectoryPath}/models/gguf/${creator.creator}/${creator.model}/${creator.file}`;
}

export const EMBEDDING_MODEL = {
    id: 'default',
    name: 'Default',
    description: 'The default embedding model for AnythingLLM.',
    size: '25MB',
    modelId: 'second-state/All-MiniLM-L6-v2-Embedding-GGUF',
    tag: 'https://huggingface.co/second-state/All-MiniLM-L6-v2-Embedding-GGUF/resolve/main/all-MiniLM-L6-v2-Q8_0.gguf',
}

export default MODEL_CARDS;