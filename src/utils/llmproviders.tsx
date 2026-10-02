import i18n, { tKey } from '@/i18n';

export type ProviderConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  region?: string;
  /** Signed-in account (email) for OAuth providers. The tokens themselves live in the keychain. */
  account?: string;
};

export type LLMProviderDefinition = {
  name: string;
  value: string;
  /** Section the provider is listed under in the provider picker. */
  category: 'local' | 'cloud';
  logo: any;
  /** Translation key - resolve with t() when rendering. */
  description: string;
  /**
   * Which connection fields the provider needs. Drives the settings/onboarding forms and
   * validation so every external provider is handled by the same generic options screen.
   * - `apiKey`: 'required' (hosted APIs), 'optional' (self-hosted servers that may sit behind auth) or `false`
   * - `baseUrl`: `true` when the user must supply the server URL (self-hosted)
   * - `region`: `true` for AWS Bedrock
   * - `oauth`: the provider is connected by signing in instead of an API key (`config.account`)
   */
  fields: {
    apiKey: 'required' | 'optional' | false;
    baseUrl: boolean;
    region?: boolean;
    oauth?: 'chatgpt';
  };
  /** Config saved when the provider is first selected. */
  defaultConfig: ProviderConfig;
  /** Hint shown in the base URL input for self-hosted providers. */
  baseUrlPlaceholder?: string;
  /** Hint shown in the manual model input when models cannot be listed. */
  modelPlaceholder?: string;
  /** Shows an "Experimental" badge in the provider pickers. */
  experimental?: boolean;
};

export const AVAILABLE_LLM_PROVIDERS: LLMProviderDefinition[] = [
  {
    name: "On-Device",
    value: "native",
    category: "local",
    logo: require('@/assets/llmprovider/ondevice.png'),
    description: tKey('providers.descriptions.native'),
    fields: { apiKey: false, baseUrl: false },
    defaultConfig: {},
  },
  {
    name: "Ollama",
    value: "ollama",
    category: "local",
    logo: require('@/assets/llmprovider/ollama.png'),
    description: tKey('providers.descriptions.ollama'),
    fields: { apiKey: false, baseUrl: true },
    defaultConfig: { baseUrl: '', model: '' },
    baseUrlPlaceholder: "http://192.168.1.10:11434",
  },
  {
    name: "LM Studio",
    value: "lmstudio",
    category: "local",
    logo: require('@/assets/llmprovider/lmstudio.png'),
    description: tKey('providers.descriptions.lmstudio'),
    fields: { apiKey: false, baseUrl: true },
    defaultConfig: { baseUrl: '', model: '' },
    baseUrlPlaceholder: "http://192.168.1.10:1234/v1",
  },
  {
    name: "ChatGPT",
    value: "chatgpt",
    category: "cloud",
    logo: require('@/assets/llmprovider/openai.png'),
    description: tKey('providers.descriptions.chatgpt'),
    fields: { apiKey: false, baseUrl: false, oauth: 'chatgpt' },
    defaultConfig: { model: '' },
    // OpenAI's plan usage for third-party apps is still a preview.
    experimental: true,
  },
  {
    name: "OpenAI",
    value: "openai",
    category: "cloud",
    logo: require('@/assets/llmprovider/openai.png'),
    description: tKey('providers.descriptions.openai'),
    fields: { apiKey: 'required', baseUrl: false },
    defaultConfig: { apiKey: '', baseUrl: 'https://api.openai.com/v1', model: '' },
    modelPlaceholder: "gpt-4o",
  },
  {
    name: "Anthropic",
    value: "anthropic",
    category: "cloud",
    logo: require('@/assets/llmprovider/anthropic.png'),
    description: tKey('providers.descriptions.anthropic'),
    fields: { apiKey: 'required', baseUrl: false },
    defaultConfig: { apiKey: '', model: '' },
    modelPlaceholder: "claude-sonnet-4-6",
  },
  {
    name: "Gemini",
    value: "gemini",
    category: "cloud",
    logo: require('@/assets/llmprovider/gemini.png'),
    description: tKey('providers.descriptions.gemini'),
    fields: { apiKey: 'required', baseUrl: false },
    defaultConfig: { apiKey: '', model: '' },
    modelPlaceholder: "gemini-2.5-flash",
  },
  {
    name: "OpenRouter",
    value: "openrouter",
    category: "cloud",
    logo: require('@/assets/llmprovider/openrouter.jpeg'),
    description: tKey('providers.descriptions.openrouter'),
    fields: { apiKey: 'required', baseUrl: false },
    defaultConfig: { apiKey: '', model: '' },
    modelPlaceholder: "qwen/qwen3-4b:free",
  },
  {
    name: "AWS Bedrock",
    value: "bedrock",
    category: "cloud",
    logo: require('@/assets/llmprovider/bedrock.png'),
    description: tKey('providers.descriptions.bedrock'),
    fields: { apiKey: 'required', baseUrl: false, region: true },
    defaultConfig: { apiKey: '', region: 'us-west-2', model: '' },
    modelPlaceholder: "minimax.minimax-m2.1",
  },
  {
    name: "DeepSeek",
    value: "deepseek",
    category: "cloud",
    logo: require('@/assets/llmprovider/deepseek.png'),
    description: tKey('providers.descriptions.deepseek'),
    fields: { apiKey: 'required', baseUrl: false },
    defaultConfig: { apiKey: '', model: '' },
    modelPlaceholder: "deepseek-chat",
  },
  {
    name: "Fireworks AI",
    value: "fireworksai",
    category: "cloud",
    logo: require('@/assets/llmprovider/fireworksai.jpeg'),
    description: tKey('providers.descriptions.fireworksai'),
    fields: { apiKey: 'required', baseUrl: false },
    defaultConfig: { apiKey: '', model: '' },
    modelPlaceholder: "accounts/fireworks/models/llama-v3p1-8b-instruct",
  },
  {
    name: "MiniMax",
    value: "minimax",
    category: "cloud",
    logo: require('@/assets/llmprovider/minimax.png'),
    description: tKey('providers.descriptions.minimax'),
    fields: { apiKey: 'required', baseUrl: false },
    defaultConfig: { apiKey: '', model: '' },
    modelPlaceholder: "MiniMax-M2",
  },
  {
    name: "Moonshot AI",
    value: "moonshotai",
    category: "cloud",
    logo: require('@/assets/llmprovider/moonshotai.png'),
    description: tKey('providers.descriptions.moonshotai'),
    fields: { apiKey: 'required', baseUrl: false },
    defaultConfig: { apiKey: '', model: '' },
    modelPlaceholder: "kimi-k2-0905-preview",
  },
  {
    name: "Novita AI",
    value: "novita",
    category: "cloud",
    logo: require('@/assets/llmprovider/novita.png'),
    description: tKey('providers.descriptions.novita'),
    fields: { apiKey: 'required', baseUrl: false },
    defaultConfig: { apiKey: '', model: '' },
    modelPlaceholder: "deepseek/deepseek-r1",
  },
  {
    name: "Together AI",
    value: "togetherai",
    category: "cloud",
    logo: require('@/assets/llmprovider/togetherai.png'),
    description: tKey('providers.descriptions.togetherai'),
    fields: { apiKey: 'required', baseUrl: false },
    defaultConfig: { apiKey: '', model: '' },
    modelPlaceholder: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  },
  {
    name: "xAI",
    value: "xai",
    category: "cloud",
    logo: require('@/assets/llmprovider/xai.png'),
    description: tKey('providers.descriptions.xai'),
    fields: { apiKey: 'required', baseUrl: false },
    defaultConfig: { apiKey: '', model: '' },
    modelPlaceholder: "grok-4",
  },
  {
    name: "LiteLLM",
    value: "litellm",
    category: "local",
    logo: require('@/assets/llmprovider/litellm.png'),
    description: tKey('providers.descriptions.litellm'),
    fields: { apiKey: 'optional', baseUrl: true },
    defaultConfig: { apiKey: '', baseUrl: '', model: '' },
    baseUrlPlaceholder: "http://192.168.1.10:4000",
  },
  {
    name: "Local AI",
    value: "localai",
    category: "local",
    logo: require('@/assets/llmprovider/localai.png'),
    description: tKey('providers.descriptions.localai'),
    fields: { apiKey: 'optional', baseUrl: true },
    defaultConfig: { apiKey: '', baseUrl: '', model: '' },
    baseUrlPlaceholder: "http://192.168.1.10:8080/v1",
  },
  {
    name: "Lemonade",
    value: "lemonade",
    category: "local",
    logo: require('@/assets/llmprovider/lemonade.png'),
    description: tKey('providers.descriptions.lemonade'),
    fields: { apiKey: false, baseUrl: true },
    defaultConfig: { baseUrl: '', model: '' },
    baseUrlPlaceholder: "http://192.168.1.10:8000",
  },
  {
    name: "llmman",
    value: "llmman",
    category: "local",
    logo: require('@/assets/llmprovider/llmman.png'),
    description: tKey('providers.descriptions.llmman'),
    fields: { apiKey: 'optional', baseUrl: true },
    defaultConfig: { apiKey: '', baseUrl: '', model: '' },
    baseUrlPlaceholder: "http://192.168.1.10:17434",
  },
  {
    name: "Generic OpenAI",
    value: "generic-openai",
    category: "cloud",
    logo: require('@/assets/llmprovider/generic-openai.png'),
    description: tKey('providers.descriptions.generic_openai'),
    fields: { apiKey: 'optional', baseUrl: true },
    defaultConfig: { apiKey: '', baseUrl: '', model: '' },
    baseUrlPlaceholder: "https://api.openai.com/v1",
  },
];

/** Display order of the local section - on-device first, Ollama last. */
const LOCAL_PROVIDER_ORDER = ['native', 'lmstudio', 'localai', 'lemonade', 'llmman', 'litellm', 'ollama'];

/** Cloud providers pinned to the top of the cloud section, in this order. The rest follow alphabetically. */
const PINNED_CLOUD_PROVIDER_ORDER = ['chatgpt', 'openai', 'anthropic', 'gemini', 'openrouter'];

/** `title` is a translation key - resolve with t() when rendering. */
export type LLMProviderSection = { title: string; providers: LLMProviderDefinition[] };

/**
 * Providers grouped for the picker:
 *  - Local Providers in a fixed order (see `LOCAL_PROVIDER_ORDER`)
 *  - Cloud Providers with the big names pinned first (see `PINNED_CLOUD_PROVIDER_ORDER`), the rest
 *    alphabetically, and Generic OpenAI forced to the very end
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
      const ai = PINNED_CLOUD_PROVIDER_ORDER.indexOf(a.value);
      const bi = PINNED_CLOUD_PROVIDER_ORDER.indexOf(b.value);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? Number.MAX_SAFE_INTEGER : ai) - (bi === -1 ? Number.MAX_SAFE_INTEGER : bi);
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

  return [
    { title: tKey('providers.sections.local'), providers: local },
    { title: tKey('providers.sections.cloud'), providers: cloud },
  ].filter((section) => section.providers.length > 0);
}

export function findProviderDefinition(value: string): LLMProviderDefinition | undefined {
  return AVAILABLE_LLM_PROVIDERS.find((provider) => provider.value === value);
}

export function providerDisplayName(value: string): string {
  if (value === 'generic-openai') return 'OpenAI (Generic)';
  return findProviderDefinition(value)?.name ?? i18n.t('common.unknown');
}

/**
 * Returns a human readable reason why the config is incomplete, or null when the
 * provider can be saved and used for chatting.
 */
export function validateProviderConfig(provider: string, config: ProviderConfig): string | null {
  const connectionError = validateProviderConnection(provider, config);
  if (connectionError) return connectionError;
  if (!config.model?.trim()) return i18n.t('providers.validation.model_required');
  return null;
}

/**
 * Like `validateProviderConfig` but ignores the model - answers "do we have enough to reach
 * the provider and list its models?".
 */
export function validateProviderConnection(provider: string, config: ProviderConfig): string | null {
  const definition = findProviderDefinition(provider);
  if (!definition) return i18n.t('providers.validation.unknown_provider');
  if (definition.fields.oauth && !config.account?.trim()) return i18n.t('providers.validation.sign_in_required');
  if (definition.fields.apiKey === 'required' && !config.apiKey?.trim()) return i18n.t('providers.validation.api_key_required');
  if (definition.fields.baseUrl && !config.baseUrl?.trim()) return i18n.t('providers.validation.base_url_required');
  if (definition.fields.region && !config.region?.trim()) return i18n.t('providers.validation.region_required');
  return null;
}

/**
 * Base URLs to try when discovering models. Many OpenAI-compatible servers
 * (LM Studio, vLLM, llama.cpp, ...) mount their routes under /v1, and users
 * frequently omit it, so we retry with /v1 appended when the URL lacks it.
 */
export function baseUrlCandidates(baseUrl: string, requiresBaseUrl: boolean): string[] {
  if (!requiresBaseUrl) return [baseUrl];
  const trimmed = baseUrl.replace(/\/+$/, '');
  if (/\/v\d+$/i.test(trimmed)) return [trimmed];
  return [trimmed, `${trimmed}/v1`];
}
