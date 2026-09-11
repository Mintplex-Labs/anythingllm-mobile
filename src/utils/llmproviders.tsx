export type ProviderConfig = { apiKey?: string; baseUrl?: string; model?: string; region?: string };

export type LLMProviderDefinition = {
  name: string;
  value: string;
  /** Section the provider is listed under in the provider picker. */
  category: 'local' | 'cloud';
  logo: any;
  description: string;
  /**
   * Which connection fields the provider needs. Drives the settings/onboarding forms and
   * validation so every external provider is handled by the same generic options screen.
   * - `apiKey`: 'required' (hosted APIs), 'optional' (self-hosted servers that may sit behind auth) or `false`
   * - `baseUrl`: `true` when the user must supply the server URL (self-hosted)
   * - `region`: `true` for AWS Bedrock
   */
  fields: {
    apiKey: 'required' | 'optional' | false;
    baseUrl: boolean;
    region?: boolean;
  };
  /** Config saved when the provider is first selected. */
  defaultConfig: ProviderConfig;
  /** Hint shown in the base URL input for self-hosted providers. */
  baseUrlPlaceholder?: string;
  /** Hint shown in the manual model input when models cannot be listed. */
  modelPlaceholder?: string;
};

export const AVAILABLE_LLM_PROVIDERS: LLMProviderDefinition[] = [
  {
    name: "On-Device",
    value: "native",
    category: "local",
    logo: require('@/assets/llmprovider/ondevice.png'),
    description: "Install and run models on your phone.",
    fields: { apiKey: false, baseUrl: false },
    defaultConfig: {},
  },
  {
    name: "Ollama",
    value: "ollama",
    category: "local",
    logo: require('@/assets/llmprovider/ollama.png'),
    description: "Run LLMs locally on your own machine with Ollama.",
    fields: { apiKey: false, baseUrl: true },
    defaultConfig: { baseUrl: '', model: '' },
    baseUrlPlaceholder: "http://192.168.1.10:11434",
  },
  {
    name: "LM Studio",
    value: "lmstudio",
    category: "local",
    logo: require('@/assets/llmprovider/lmstudio.png'),
    description: "Discover, download, and run thousands of cutting edge LLMs in a few clicks.",
    fields: { apiKey: false, baseUrl: true },
    defaultConfig: { baseUrl: '', model: '' },
    baseUrlPlaceholder: "http://192.168.1.10:1234/v1",
  },
  {
    name: "OpenAI",
    value: "openai",
    category: "cloud",
    logo: require('@/assets/llmprovider/openai.png'),
    description: "Leverage OpenAI's powerful models.",
    fields: { apiKey: 'required', baseUrl: false },
    defaultConfig: { apiKey: '', baseUrl: 'https://api.openai.com/v1', model: '' },
    modelPlaceholder: "gpt-4o",
  },
  {
    name: "Anthropic",
    value: "anthropic",
    category: "cloud",
    logo: require('@/assets/llmprovider/anthropic.png'),
    description: "A friendly AI Assistant hosted by Anthropic.",
    fields: { apiKey: 'required', baseUrl: false },
    defaultConfig: { apiKey: '', model: '' },
    modelPlaceholder: "claude-sonnet-4-6",
  },
  {
    name: "Gemini",
    value: "gemini",
    category: "cloud",
    logo: require('@/assets/llmprovider/gemini.png'),
    description: "Google's largest and most capable AI model",
    fields: { apiKey: 'required', baseUrl: false },
    defaultConfig: { apiKey: '', model: '' },
    modelPlaceholder: "gemini-2.5-flash",
  },
  {
    name: "OpenRouter",
    value: "openrouter",
    category: "cloud",
    logo: require('@/assets/llmprovider/openrouter.jpeg'),
    description: "A unified API of AI services from leading providers",
    fields: { apiKey: 'required', baseUrl: false },
    defaultConfig: { apiKey: '', model: '' },
    modelPlaceholder: "qwen/qwen3-4b:free",
  },
  {
    name: "AWS Bedrock",
    value: "bedrock",
    category: "cloud",
    logo: require('@/assets/llmprovider/bedrock.png'),
    description: "Run powerful foundation models privately with AWS Bedrock.",
    fields: { apiKey: 'required', baseUrl: false, region: true },
    defaultConfig: { apiKey: '', region: 'us-west-2', model: '' },
    modelPlaceholder: "minimax.minimax-m2.1",
  },
  {
    name: "DeepSeek",
    value: "deepseek",
    category: "cloud",
    logo: require('@/assets/llmprovider/deepseek.png'),
    description: "Run DeepSeek's powerful LLMs.",
    fields: { apiKey: 'required', baseUrl: false },
    defaultConfig: { apiKey: '', model: '' },
    modelPlaceholder: "deepseek-chat",
  },
  {
    name: "Fireworks AI",
    value: "fireworksai",
    category: "cloud",
    logo: require('@/assets/llmprovider/fireworksai.jpeg'),
    description: "The fastest and most efficient inference engine to build production-ready, compound AI systems.",
    fields: { apiKey: 'required', baseUrl: false },
    defaultConfig: { apiKey: '', model: '' },
    modelPlaceholder: "accounts/fireworks/models/llama-v3p1-8b-instruct",
  },
  {
    name: "MiniMax",
    value: "minimax",
    category: "cloud",
    logo: require('@/assets/llmprovider/minimax.png'),
    description: "Run MiniMax's powerful LLMs.",
    fields: { apiKey: 'required', baseUrl: false },
    defaultConfig: { apiKey: '', model: '' },
    modelPlaceholder: "MiniMax-M2",
  },
  {
    name: "Moonshot AI",
    value: "moonshotai",
    category: "cloud",
    logo: require('@/assets/llmprovider/moonshotai.png'),
    description: "Run Moonshot AI's Kimi models.",
    fields: { apiKey: 'required', baseUrl: false },
    defaultConfig: { apiKey: '', model: '' },
    modelPlaceholder: "kimi-k2-0905-preview",
  },
  {
    name: "Novita AI",
    value: "novita",
    category: "cloud",
    logo: require('@/assets/llmprovider/novita.png'),
    description: "Reliable, Scalable, and Cost-Effective for LLMs from Novita AI",
    fields: { apiKey: 'required', baseUrl: false },
    defaultConfig: { apiKey: '', model: '' },
    modelPlaceholder: "deepseek/deepseek-r1",
  },
  {
    name: "Together AI",
    value: "togetherai",
    category: "cloud",
    logo: require('@/assets/llmprovider/togetherai.png'),
    description: "Run open source models from Together AI.",
    fields: { apiKey: 'required', baseUrl: false },
    defaultConfig: { apiKey: '', model: '' },
    modelPlaceholder: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  },
  {
    name: "xAI",
    value: "xai",
    category: "cloud",
    logo: require('@/assets/llmprovider/xai.png'),
    description: "Run xAI's powerful LLMs like Grok and more.",
    fields: { apiKey: 'required', baseUrl: false },
    defaultConfig: { apiKey: '', model: '' },
    modelPlaceholder: "grok-4",
  },
  {
    name: "LiteLLM",
    value: "litellm",
    category: "local",
    logo: require('@/assets/llmprovider/litellm.png'),
    description: "Run LiteLLM's OpenAI compatible proxy for various LLMs.",
    fields: { apiKey: 'optional', baseUrl: true },
    defaultConfig: { apiKey: '', baseUrl: '', model: '' },
    baseUrlPlaceholder: "http://192.168.1.10:4000",
  },
  {
    name: "Local AI",
    value: "localai",
    category: "local",
    logo: require('@/assets/llmprovider/localai.png'),
    description: "Run LLMs locally on your own machine.",
    fields: { apiKey: 'optional', baseUrl: true },
    defaultConfig: { apiKey: '', baseUrl: '', model: '' },
    baseUrlPlaceholder: "http://192.168.1.10:8080/v1",
  },
  {
    name: "Lemonade",
    value: "lemonade",
    category: "local",
    logo: require('@/assets/llmprovider/lemonade.png'),
    description: "Run LLMs on AMD hardware with Lemonade Server.",
    fields: { apiKey: false, baseUrl: true },
    defaultConfig: { baseUrl: '', model: '' },
    baseUrlPlaceholder: "http://192.168.1.10:8000",
  },
  {
    name: "Generic OpenAI",
    value: "generic-openai",
    category: "cloud",
    logo: require('@/assets/llmprovider/generic-openai.png'),
    description:
      "Connect to any OpenAi-compatible service via a custom configuration",
    fields: { apiKey: 'optional', baseUrl: true },
    defaultConfig: { apiKey: '', baseUrl: '', model: '' },
    baseUrlPlaceholder: "https://api.openai.com/v1",
  },
];

/** Display order of the local section - on-device first, Ollama last. */
const LOCAL_PROVIDER_ORDER = ['native', 'lmstudio', 'localai', 'lemonade', 'litellm', 'ollama'];

export type LLMProviderSection = { title: string; providers: LLMProviderDefinition[] };

/**
 * Providers grouped for the picker:
 *  - Local Providers in a fixed order (see `LOCAL_PROVIDER_ORDER`)
 *  - Cloud Providers alphabetically, with Generic OpenAI forced to the very end
 * Sections with no providers left after `exclude` are dropped.
 */
export function groupProvidersForPicker(providers: LLMProviderDefinition[] = AVAILABLE_LLM_PROVIDERS): LLMProviderSection[] {
  const local = providers
    .filter((p) => p.category === 'local')
    .sort((a, b) => {
      const ai = LOCAL_PROVIDER_ORDER.indexOf(a.value);
      const bi = LOCAL_PROVIDER_ORDER.indexOf(b.value);
      return (ai === -1 ? Number.MAX_SAFE_INTEGER : ai) - (bi === -1 ? Number.MAX_SAFE_INTEGER : bi);
    });

  const cloud = providers
    .filter((p) => p.category === 'cloud')
    .sort((a, b) => {
      if (a.value === 'generic-openai') return 1;
      if (b.value === 'generic-openai') return -1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

  return [
    { title: 'Local Providers', providers: local },
    { title: 'Cloud Providers', providers: cloud },
  ].filter((section) => section.providers.length > 0);
}

export function findProviderDefinition(value: string): LLMProviderDefinition | undefined {
  return AVAILABLE_LLM_PROVIDERS.find((provider) => provider.value === value);
}

export function providerDisplayName(value: string): string {
  if (value === 'generic-openai') return 'OpenAI (Generic)';
  return findProviderDefinition(value)?.name ?? 'Unknown';
}

/**
 * Returns a human readable reason why the config is incomplete, or null when the
 * provider can be saved and used for chatting.
 */
export function validateProviderConfig(provider: string, config: ProviderConfig): string | null {
  const definition = findProviderDefinition(provider);
  if (!definition) return 'Unknown provider.';
  if (definition.fields.apiKey === 'required' && !config.apiKey?.trim()) return 'Please enter an API key for this provider.';
  if (definition.fields.baseUrl && !config.baseUrl?.trim()) return 'Please enter the base URL of your provider.';
  if (definition.fields.region && !config.region?.trim()) return 'Please select the AWS region of your Bedrock deployment.';
  if (!config.model?.trim()) return 'Please select a model to use.';
  return null;
}
