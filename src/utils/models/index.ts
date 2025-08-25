import { NPUEnabledModel, Model, ModelOrigin } from '@/utils/types';
import { chatTemplates } from '@/utils/chat';
import { Platform } from 'react-native';

export const MODEL_LIST_VERSION = 11;
const iosOnlyModels: Model[] = [];
const androidOnlyModels: NPUEnabledModel[] = [
  // -------- Phi --------
  {
    id: 'qualcomm/phi-3.5-mini-instruct',
    runtime: 'NPU',
    author: 'Microsfot',
    name: 'Phi-3.5 mini 4k instruct',
    type: 'Phi',
    capabilities: ['reasoning', 'multilingual'],
    size: 2e+9,
    params: 3.8e+9,
    isDownloaded: false,
    downloadUrl: '',
    origin: ModelOrigin.ANYTHINGLLM,
    defaultChatTemplate: { ...chatTemplates.phi3 },
    chatTemplate: chatTemplates.phi3,
    cdnUrls: [
      // 'https://cdn.anythingllm.com/mobile/tokenizer.json',
      // 'https://cdn.anythingllm.com/mobile/genie_config.json',
      // 'https://cdn.anythingllm.com/mobile/bin_1_of_4.bin',
      // 'https://cdn.anythingllm.com/mobile/bin_2_of_4.bin',
      // 'https://cdn.anythingllm.com/mobile/bin_3_of_4.bin',
      // 'https://cdn.anythingllm.com/mobile/bin_4_of_4.bin',
    ],
    modelId: 'phi-3.5-mini-instruct',
    progress: 0,
  },
];

const crossPlatformModels: Model[] = [
  // -------- Gemma --------
  {
    id: 'unsloth/gemma-3-1b-it-GGUF',
    runtime: 'CPU',
    author: 'unsloth',
    name: 'Gemma-3-1b',
    description: '(Q8_0) Gemma3 1B is a smaller lightweight version of the Gemma3 4B model for more complex tasks.',
    type: 'Gemma',
    capabilities: ['questionAnswering', 'summarization', 'reasoning'],
    size: 1.07e+9,
    params: 1_000_000_000,
    isDownloaded: false,
    downloadUrl:
      'https://huggingface.co/unsloth/gemma-3-1b-it-GGUF/blob/main/gemma-3-1b-it-Q8_0.gguf',
    hfUrl: 'https://huggingface.co/unsloth/gemma-3-1b-it-GGUF',
    imageUrl: 'https://cdn-avatars.huggingface.co/v1/production/uploads/5dd96eb166059660ed1ee413/WtA3YYitedOr9n02eHfJe.png',
    progress: 0,
    filename: 'gemma-3-1b-it-Q8_0.gguf',
    isLocal: false,
    origin: ModelOrigin.HF,
    defaultChatTemplate: { ...chatTemplates.gemma3 },
    chatTemplate: chatTemplates.gemma3,
    defaultCompletionSettings: {
      temperature: 1,
      top_p: 0.95,
      top_k: 64,
      min_p: 0,
    },
    completionSettings: {
      temperature: 1,
      top_p: 0.95,
      top_k: 64,
      min_p: 0,
    },
    defaultStopWords: ['<end_of_turn>'],
    stopWords: ['<end_of_turn>'],
  },

  // -------- Phi --------
  // {
  //   id: 'MaziyarPanahi/Phi-3.5-mini-instruct-GGUF/Phi-3.5-mini-instruct.Q4_K_M.gguf',
  //   runtime: 'CPU',
  //   author: 'MaziyarPanahi',
  //   name: 'Phi-3.5 mini 4k instruct (Q4_K_M)',
  //   type: 'Phi',
  //   capabilities: ['reasoning', 'code', 'math', 'multilingual'],
  //   size: 2393232608,
  //   params: 3821079648,
  //   isDownloaded: false,
  //   downloadUrl:
  //     'https://huggingface.co/MaziyarPanahi/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct.Q4_K_M.gguf',
  //   hfUrl: 'https://huggingface.co/MaziyarPanahi/Phi-3.5-mini-instruct-GGUF',
  //   progress: 0,
  //   filename: 'Phi-3.5-mini-instruct.Q4_K_M.gguf',
  //   isLocal: false,
  //   origin: ModelOrigin.PRESET,
  //   defaultChatTemplate: { ...chatTemplates.phi3 },
  //   chatTemplate: chatTemplates.phi3,
  //   defaultCompletionSettings: {
  //     ...defaultCompletionParams,
  //     n_predict: 500,
  //     temperature: 0.1,
  //   },
  //   completionSettings: {
  //     ...defaultCompletionParams,
  //     n_predict: 500,
  //     temperature: 0.1,
  //   },
  //   defaultStopWords: ['<|end|>'],
  //   stopWords: ['<|end|>'],
  //   hfModelFile: {
  //     rfilename: 'Phi-3.5-mini-instruct.Q4_K_M.gguf',
  //     url: 'https://huggingface.co/MaziyarPanahi/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct.Q4_K_M.gguf',
  //     size: 2393232608,
  //     oid: 'a2b0f35b7504ba395e886fadd5ebc61236b9f5ec',
  //     lfs: {
  //       oid: '3f68916e850b107d8641d18bcd5548f0d66beef9e0a9077fe84ef28943eb7e88',
  //       size: 2393232608,
  //       pointerSize: 135,
  //     },
  //     canFitInStorage: true,
  //   },
  // },
  // -------- Qwen --------
  {
    id: 'unsloth/Qwen3-1.7B-GGUF',
    runtime: 'CPU',
    author: 'Qwen',
    name: 'Qwen3-1.7B',
    description: '(Q8_0) Qwen3 1.7B is a much more capable version of the Qwen3-0.6B model for more complex tasks.',
    type: 'Qwen',
    capabilities: ['text-generation', 'reasoning'],
    size: 1.83e+9,
    params: 1_700_000_000,
    isDownloaded: false,
    downloadUrl: 'https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q8_0.gguf',
    imageUrl: 'https://cdn-avatars.huggingface.co/v1/production/uploads/620760a26e3b7210c2ff1943/-s1gyJfvbE1RgO5iBeNOi.png',
    hfUrl: 'https://huggingface.co/unsloth/Qwen3-1.7B-GGUF',
    progress: 0,
    filename: 'Qwen3-1.7B-Q8_0.gguf',
    isLocal: false,
    origin: ModelOrigin.HF,
    defaultChatTemplate: { ...chatTemplates.qwen3 },
    chatTemplate: chatTemplates.qwen3,
    defaultCompletionSettings: {
    },
    completionSettings: {
    },
    defaultStopWords: ['<|im_end|>'],
    stopWords: ['<|im_end|>'],
  },

  // -------- Llama --------
  {
    id: 'unsloth/Llama-3.2-1B-Instruct-GGUF',
    runtime: 'CPU',
    author: 'unsloth',
    name: 'Llama 3.2 1B',
    description: '(Q8_0) Llama 3.2 1B is the smallest version of the Llama 3.2 model.',
    type: 'Llama',
    capabilities: ['text-generation'],
    size: 1.32e+9,
    params: 1.24e+9,
    isDownloaded: false,
    downloadUrl:
      'https://huggingface.co/unsloth/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q8_0.gguf',
    imageUrl: 'https://cdn-avatars.huggingface.co/v1/production/uploads/646cf8084eefb026fb8fd8bc/oCTqufkdTkjyGodsx1vo1.png',
    hfUrl:
      'https://huggingface.co/unsloth/Llama-3.2-1B-Instruct-GGUF',
    progress: 0,
    filename: 'Llama-3.2-1B-Instruct-Q8_0.gguf',
    isLocal: false,
    origin: ModelOrigin.HF,
    defaultChatTemplate: { ...chatTemplates.llama32 },
    chatTemplate: chatTemplates.llama32,
    defaultCompletionSettings: {
    },
    completionSettings: {
    },
    defaultStopWords: ['<|eot_id|>'],
    stopWords: ['<|eot_id|>'],
    hfModelFile: {
      rfilename: 'llama-3.2-1b-instruct-q8_0.gguf',
      url: 'https://huggingface.co/hugging-quants/Llama-3.2-1B-Instruct-Q8_0-GGUF/resolve/main/llama-3.2-1b-instruct-q8_0.gguf',
      size: 1321079200,
      oid: '4d5402369568f0bd157d8454270821341e833722',
      lfs: {
        oid: 'ba345c83bf5cc679c653b853c46517eea5a34f03ed2205449db77184d9ae62a9',
        size: 1321079200,
        pointerSize: 135,
      },
      canFitInStorage: true,
    },
  },
  // {
  //   id: 'hugging-quants/Llama-3.2-1B-Instruct-Q8_0-GGUF/llama-3.2-1b-instruct-q8_0.gguf',
  //   runtime: 'CPU',
  //   author: 'hugging-quants',
  //   name: 'Llama-3.2-1b-instruct (Q8_0)',
  //   type: 'Llama',
  //   capabilities: ['text-generation'],
  //   size: 1321079200,
  //   params: 1235814432,
  //   isDownloaded: false,
  //   downloadUrl:
  //     'https://huggingface.co/hugging-quants/Llama-3.2-1B-Instruct-Q8_0-GGUF/resolve/main/llama-3.2-1b-instruct-q8_0.gguf',
  //   hfUrl:
  //     'https://huggingface.co/hugging-quants/Llama-3.2-1B-Instruct-Q8_0-GGUF',
  //   progress: 0,
  //   filename: 'llama-3.2-1b-instruct-q8_0.gguf',
  //   isLocal: false,
  //   origin: ModelOrigin.PRESET,
  //   defaultChatTemplate: { ...chatTemplates.llama32 },
  //   chatTemplate: chatTemplates.llama32,
  //   defaultCompletionSettings: {
  //     ...defaultCompletionParams,
  //     n_predict: 500,
  //     temperature: 0.5,
  //   },
  //   completionSettings: {
  //     ...defaultCompletionParams,
  //     n_predict: 500,
  //     temperature: 0.5,
  //   },
  //   defaultStopWords: ['<|eot_id|>'],
  //   stopWords: ['<|eot_id|>'],
  //   hfModelFile: {
  //     rfilename: 'llama-3.2-1b-instruct-q8_0.gguf',
  //     url: 'https://huggingface.co/hugging-quants/Llama-3.2-1B-Instruct-Q8_0-GGUF/resolve/main/llama-3.2-1b-instruct-q8_0.gguf',
  //     size: 1321079200,
  //     oid: '4d5402369568f0bd157d8454270821341e833722',
  //     lfs: {
  //       oid: 'ba345c83bf5cc679c653b853c46517eea5a34f03ed2205449db77184d9ae62a9',
  //       size: 1321079200,
  //       pointerSize: 135,
  //     },
  //     canFitInStorage: true,
  //   },
  // },
  // {
  //   id: 'bartowski/Llama-3.2-3B-Instruct-GGUF/Llama-3.2-3B-Instruct-Q6_K.gguf',
  //   runtime: 'CPU',
  //   author: 'bartowski',
  //   name: 'Llama-3.2-3B-Instruct (Q6_K)',
  //   type: 'Llama',
  //   capabilities: ['text-generation'],
  //   size: 2643853856,
  //   params: 3212749888,
  //   isDownloaded: false,
  //   downloadUrl:
  //     'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q6_K.gguf',
  //   hfUrl: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF',
  //   progress: 0,
  //   filename: 'Llama-3.2-3B-Instruct-Q6_K.gguf',
  //   isLocal: false,
  //   origin: ModelOrigin.PRESET,
  //   defaultChatTemplate: { ...chatTemplates.llama32 },
  //   chatTemplate: chatTemplates.llama32,
  //   defaultCompletionSettings: {
  //     ...defaultCompletionParams,
  //     n_predict: 500,
  //     temperature: 0.5,
  //   },
  //   completionSettings: {
  //     ...defaultCompletionParams,
  //     n_predict: 500,
  //     temperature: 0.5,
  //   },
  //   defaultStopWords: ['<|eot_id|>'],
  //   stopWords: ['<|eot_id|>'],
  //   hfModelFile: {
  //     rfilename: 'Llama-3.2-3B-Instruct-Q6_K.gguf',
  //     url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q6_K.gguf',
  //     size: 2643853856,
  //     oid: '47d12cf8883aaa6a6cd0b47975cc026980a3af9d',
  //     lfs: {
  //       oid: '1771887c15fc3d327cfee6fd593553b2126e88834bf48eae50e709d3f70dd998',
  //       size: 2643853856,
  //       pointerSize: 135,
  //     },
  //     canFitInStorage: true,
  //   },
  // },
  // -------- Menlo Lucy 1.7B --------
  // https://huggingface.co/Menlo/Lucy-gguf
  {
    id: 'Menlo/Lucy-gguf',
    description: '(Q8_0) Lucy 1.7B by Menlo Research is an LLM specifically for the edge.',
    runtime: 'CPU',
    author: 'Menlo',
    name: 'Lucy 1.7B',
    type: 'Qwen',
    ggufFilePath: 'Menlo/Lucy-gguf/Lucy-Q8_0.gguf',
    capabilities: ['text-generation', 'tool-use'],
    size: 1.83e+9,
    params: 1_700_000_000,
    downloadUrl: 'https://huggingface.co/Menlo/Lucy-gguf/resolve/main/Lucy-Q8_0.gguf',
    completionSettings: {
      temperature: 0.7,
      top_p: 0.8,
      top_k: 20,
      min_p: 0,
    },
    imageUrl: 'https://cdn-avatars.huggingface.co/v1/production/uploads/643b63fea856622f978fdc35/c8ZIKZbg-Y4ZxkUgMLV8q.png',

    // Unused?
    isDownloaded: false,
    hfUrl: 'https://huggingface.co/Menlo/Lucy-gguf',
    progress: 0,
    filename: 'Lucy-Q8_0.gguf',
    isLocal: false,
    origin: ModelOrigin.HF,
    defaultChatTemplate: { ...chatTemplates.qwen3 },
    chatTemplate: { ...chatTemplates.qwen3 },
    defaultCompletionSettings: {
      temperature: 0.7,
      top_p: 0.9,
      top_k: 20,
      min_p: 0,
    },
    defaultStopWords: ['<|im_end|>'],
    stopWords: ['<|im_end|>'],
  },
];

export const defaultModels =
  Platform.OS === 'android'
    ? [...androidOnlyModels, ...crossPlatformModels]
    : [...iosOnlyModels, ...crossPlatformModels];
