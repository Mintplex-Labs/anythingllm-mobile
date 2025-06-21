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

  // -------- Jan-nano --------
  // https://huggingface.co/Menlo/Jan-nano-gguf/resolve/main/jan-nano-4b-Q4_K_S.gguf
  {
    id: 'Menlo/Jan-Nano-4b-GGUF',
    description: '(Q4_K_S) Jan-Nano by Menlo Research is an LLM specifically for deep research tasks.',
    runtime: 'CPU',
    author: 'Menlo',
    name: 'Jan-Nano 4B',
    type: 'Qwen',
    ggufFilePath: 'Menlo/Jan-nano-gguf/jan-nano-4b-Q4_K_S.gguf',
    capabilities: ['text-generation', 'tool-use'],
    size: 2.38e+9,
    params: 4_000_000_000,
    downloadUrl: 'https://huggingface.co/Menlo/Jan-nano-gguf/resolve/main/jan-nano-4b-Q4_K_S.gguf',
    chatTemplateString: "{%- if tools %}\n    {{- '<|im_start|>system\\n' }}\n    {%- if messages[0].role == 'system' %}\n        {{- messages[0].content + '\\n\\n' }}\n    {%- endif %}\n    {{- \"# Tools\\n\\nYou may call one or more functions to assist with the user query.\\n\\nYou are provided with function signatures within <tools></tools> XML tags:\\n<tools>\" }}\n    {%- for tool in tools %}\n        {{- \"\\n\" }}\n        {{- tool | tojson }}\n    {%- endfor %}\n    {{- \"\\n</tools>\\n\\nFor each function call, return a json object with function name and arguments within <tool_call></tool_call> XML tags:\\n<tool_call>\\n{\\\"name\\\": <function-name>, \\\"arguments\\\": <args-json-object>}\\n</tool_call><|im_end|>\\n\" }}\n{%- else %}\n    {%- if messages[0].role == 'system' %}\n        {{- '<|im_start|>system\\n' + messages[0].content + '<|im_end|>\\n' }}\n    {%- endif %}\n{%- endif %}\n{%- set ns = namespace(multi_step_tool=true, last_query_index=messages|length - 1) %}\n{%- for message in messages[::-1] %}\n    {%- set index = (messages|length - 1) - loop.index0 %}\n    {%- if ns.multi_step_tool and message.role == \"user\" and message.content is string and not(message.content.startswith('<tool_response>') and message.content.endswith('</tool_response>')) %}\n        {%- set ns.multi_step_tool = false %}\n        {%- set ns.last_query_index = index %}\n    {%- endif %}\n{%- endfor %}\n{%- for message in messages %}\n    {%- if message.content is string %}\n        {%- set content = message.content %}\n    {%- else %}\n        {%- set content = '' %}\n    {%- endif %}\n    {%- if (message.role == \"user\") or (message.role == \"system\" and not loop.first) %}\n        {{- '<|im_start|>' + message.role + '\\n' + content + '<|im_end|>' + '\\n' }}\n    {%- elif message.role == \"assistant\" %}\n        {%- set reasoning_content = '' %}\n        {%- if message.reasoning_content is string %}\n            {%- set reasoning_content = message.reasoning_content %}\n        {%- else %}\n            {%- if '</think>' in content %}\n                {%- set reasoning_content = content.split('</think>')[0].rstrip('\\n').split('<think>')[-1].lstrip('\\n') %}\n                {%- set content = content.split('</think>')[-1].lstrip('\\n') %}\n            {%- endif %}\n        {%- endif %}\n        {%- if loop.index0 > ns.last_query_index %}\n            {%- if loop.last or (not loop.last and reasoning_content) %}\n                {{- '<|im_start|>' + message.role + '\\n<think>\\n' + reasoning_content.strip('\\n') + '\\n</think>\\n\\n' + content.lstrip('\\n') }}\n            {%- else %}\n                {{- '<|im_start|>' + message.role + '\\n' + content }}\n            {%- endif %}\n        {%- else %}\n            {{- '<|im_start|>' + message.role + '\\n' + content }}\n        {%- endif %}\n        {%- if message.tool_calls %}\n            {%- for tool_call in message.tool_calls %}\n                {%- if (loop.first and content) or (not loop.first) %}\n                    {{- '\\n' }}\n                {%- endif %}\n                {%- if tool_call.function %}\n                    {%- set tool_call = tool_call.function %}\n                {%- endif %}\n                {{- '<tool_call>\\n{\"name\": \"' }}\n                {{- tool_call.name }}\n                {{- '\", \"arguments\": ' }}\n                {%- if tool_call.arguments is string %}\n                    {{- tool_call.arguments }}\n                {%- else %}\n                    {{- tool_call.arguments | tojson }}\n                {%- endif %}\n                {{- '}\\n</tool_call>' }}\n            {%- endfor %}\n        {%- endif %}\n        {{- '<|im_end|>\\n' }}\n    {%- elif message.role == \"tool\" %}\n        {%- if loop.first or (messages[loop.index0 - 1].role != \"tool\") %}\n            {{- '<|im_start|>user' }}\n        {%- endif %}\n        {{- '\\n<tool_response>\\n' }}\n        {{- content }}\n        {{- '\\n</tool_response>' }}\n        {%- if loop.last or (messages[loop.index0 + 1].role != \"tool\") %}\n            {{- '<|im_end|>\\n' }}\n        {%- endif %}\n    {%- endif %}\n{%- endfor %}\n{%- if add_generation_prompt %}\n    {{- '<|im_start|>assistant\\n<think>\\n\\n</think>\\n\\n' }}\n{%- endif %}",
    completionSettings: {
      temperature: 0.7,
      top_p: 0.8,
      top_k: 20,
      min_p: 0,
    },

    // Unused?
    isDownloaded: false,
    hfUrl: 'https://huggingface.co/Menlo/Jan-nano-gguf',
    progress: 0,
    filename: 'jan-nano-4b-Q4_K_S.gguf',
    isLocal: false,
    origin: ModelOrigin.HF,
    defaultChatTemplate: { ...chatTemplates.qwen3 },
    chatTemplate: { ...chatTemplates.qwen3 },
    defaultCompletionSettings: {
      temperature: 0.7,
      top_p: 0.8,
      top_k: 20,
      min_p: 0,
    },
    defaultStopWords: ['<|im_end|>'],
    stopWords: ['<|im_end|>'],
  },


  // -------- Gemma --------
  // {
  //   id: 'unsloth/gemma-3-1b-it-GGUF/gemma-3-1b-it-Q8_0.gguf',
  //   runtime: 'CPU',
  //   author: 'unsloth',
  //   name: 'Gemma-3-1b-it (Q8_0)',
  //   type: 'Gemma',
  //   capabilities: ['text-generation', 'reasoning'],
  //   size: 1069306400,
  //   params: 1_000_000_000,
  //   isDownloaded: false,
  //   downloadUrl:
  //     'https://huggingface.co/unsloth/gemma-3-1b-it-GGUF/blob/main/gemma-3-1b-it-Q8_0.gguf',
  //   hfUrl: 'https://huggingface.co/unsloth/gemma-3-1b-it-GGUF',
  //   progress: 0,
  //   filename: 'gemma-3-1b-it-Q8_0.gguf',
  //   isLocal: false,
  //   origin: ModelOrigin.PRESET,
  //   defaultChatTemplate: { ...chatTemplates.gemma3 },
  //   chatTemplate: chatTemplates.gemma3,
  //   defaultCompletionSettings: {
  //     ...defaultCompletionParams,
  //     n_predict: 500,
  //     temperature: 0.0,
  //     penalty_repeat: 1.0,
  //   },
  //   completionSettings: {
  //     // https://huggingface.co/google/gemma-7b-it/discussions/38#65d7b14adb51f7c160769fa1
  //     ...defaultCompletionParams,
  //     n_predict: 500,
  //     temperature: 0.0,
  //     penalty_repeat: 1.0,
  //   },
  //   defaultStopWords: ['<end_of_turn>', '<eos>'],
  //   stopWords: ['<end_of_turn>', '<eos>'],
  //   hfModelFile: {
  //     rfilename: 'gemma-3-1b-it-Q8_0.gguf',
  //     url: 'https://huggingface.co/unsloth/gemma-3-1b-it-GGUF/blob/main/gemma-3-1b-it-Q8_0.gguf',
  //     size: 1069306400,
  //     oid: '616dfb049ad14288d971d96f5ca4953fdebbf1e3cd407ad159f3bfd47090201d',
  //     lfs: {
  //       oid: '616dfb049ad14288d971d96f5ca4953fdebbf1e3cd407ad159f3bfd47090201d',
  //       size: 1069306400,
  //       pointerSize: 135,
  //     },
  //     canFitInStorage: true,
  //   },
  // },
  // {
  //   id: 'bartowski/gemma-2-2b-it-GGUF/gemma-2-2b-it-Q6_K.gguf',
  //   runtime: 'CPU',
  //   author: 'bartowski',
  //   name: 'Gemma-2-2b-it (Q6_K)',
  //   type: 'Gemma',
  //   capabilities: ['questionAnswering', 'summarization', 'reasoning'],
  //   size: 2151393120,
  //   params: 2614341888,
  //   isDownloaded: false,
  //   downloadUrl:
  //     'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q6_K.gguf',
  //   hfUrl: 'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF',
  //   progress: 0,
  //   filename: 'gemma-2-2b-it-Q6_K.gguf',
  //   isLocal: false,
  //   origin: ModelOrigin.PRESET,
  //   defaultChatTemplate: { ...chatTemplates.gemmaIt },
  //   chatTemplate: chatTemplates.gemmaIt,
  //   defaultCompletionSettings: {
  //     ...defaultCompletionParams,
  //     n_predict: 500,
  //     temperature: 0.0,
  //     penalty_repeat: 1.0,
  //   },
  //   completionSettings: {
  //     // https://huggingface.co/google/gemma-7b-it/discussions/38#65d7b14adb51f7c160769fa1
  //     ...defaultCompletionParams,
  //     n_predict: 500,
  //     temperature: 0.0,
  //     penalty_repeat: 1.0,
  //   },
  //   defaultStopWords: ['<end_of_turn>'],
  //   stopWords: ['<end_of_turn>'],
  //   hfModelFile: {
  //     rfilename: 'gemma-2-2b-it-Q6_K.gguf',
  //     url: 'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q6_K.gguf',
  //     size: 2151393120,
  //     oid: '72f2510b5868d1141617aa16cfc4c4a61ec77262',
  //     lfs: {
  //       oid: 'f82c5c2230a8b452221706461eb93203443373625d96a05912d4f96c845c2775',
  //       size: 2151393120,
  //       pointerSize: 135,
  //     },
  //     canFitInStorage: true,
  //   },
  // },
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
  // {
  //   id: 'Qwen/Qwen3-0.6B-GGUF/Qwen3-0.6B-Q8_0.gguf',
  //   runtime: 'CPU',
  //   author: 'Qwen',
  //   name: 'Qwen3-0.6B (Q8_0)',
  //   type: 'Qwen',
  //   capabilities: ['text-generation', 'reasoning'],
  //   size: 639446688,
  //   params: 600000000,
  //   isDownloaded: false,
  //   downloadUrl:
  //     'https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf',
  //   hfUrl: 'https://huggingface.co/Qwen/Qwen3-0.6B-GGUF',
  //   progress: 0,
  //   filename: 'Qwen3-0.6B-Q8_0.gguf',
  //   isLocal: false,
  //   origin: ModelOrigin.PRESET,
  //   defaultChatTemplate: { ...chatTemplates.qwen3 },
  //   chatTemplate: chatTemplates.qwen3,
  //   defaultCompletionSettings: {
  //     ...defaultCompletionParams,
  //     n_predict: 2048,
  //     temperature: 0.5,
  //   },
  //   completionSettings: {
  //     ...defaultCompletionParams,
  //     n_predict: 2048,
  //     temperature: 0.5,
  //   },
  //   defaultStopWords: ['<|im_end|>'],
  //   stopWords: ['<|im_end|>'],
  //   hfModelFile: {
  //     rfilename: 'Qwen3-0.6B-Q8_0.gguf',
  //     url: 'https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf',
  //     size: 639446688,
  //     oid: '9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031',
  //     lfs: {
  //       oid: '9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031',
  //       size: 639446688,
  //       pointerSize: 135,
  //     },
  //     canFitInStorage: true,
  //   },
  // },

  // -------- Llama --------
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
];

export const defaultModels =
  Platform.OS === 'android'
    ? [...androidOnlyModels, ...crossPlatformModels]
    : [...iosOnlyModels, ...crossPlatformModels];
