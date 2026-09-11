import OpenAICompatible from "./openAICompatible";
import OnDeviceProvider from "./onDevice";
import LMStudioProvider from "./LMStudioProvider";
import OllamaProvider from "./OllamaProvider";
import OpenRouterProvider from "./OpenRouterProvider";
import AnthropicProvider from "./AnthropicProvider";
import GeminiProvider from "./GeminiProvider";
import LiteLLMProvider from "./LiteLLMProvider";
import BedrockProvider from "./BedrockProvider";
import DeepSeekProvider from "./DeepSeekProvider";
import FireworksAIProvider from "./FireworksAIProvider";
import LemonadeProvider from "./LemonadeProvider";
import LocalAIProvider from "./LocalAIProvider";
import MiniMaxProvider from "./MiniMaxProvider";
import MoonshotProvider from "./MoonshotProvider";
import NovitaProvider from "./NovitaProvider";
import TogetherAIProvider from "./TogetherAIProvider";
import XAIProvider from "./XAIProvider";

export type LLMProvider = OpenAICompatible |
  OnDeviceProvider |
  LMStudioProvider |
  OllamaProvider |
  OpenRouterProvider |
  AnthropicProvider |
  GeminiProvider |
  LiteLLMProvider |
  BedrockProvider |
  DeepSeekProvider |
  FireworksAIProvider |
  LemonadeProvider |
  LocalAIProvider |
  MiniMaxProvider |
  MoonshotProvider |
  NovitaProvider |
  TogetherAIProvider |
  XAIProvider;

/**
 * Builds the LLM provider for a saved preference.
 * `config` is the object persisted in `llmPreference` storage: `{ apiKey, baseUrl, model, region }`
 * (only the keys relevant to the provider are ever set - see `AVAILABLE_LLM_PROVIDERS`).
 */
function getLLM(provider: string, config: { [key: string]: any } = {}): LLMProvider {
  const hosted = { apiKey: config.apiKey, model: config.model };
  const selfHosted = { baseURL: config.baseUrl, apiKey: config.apiKey, model: config.model };

  switch (provider) {
    case 'openai':
      return new OpenAICompatible({ provider: 'openai', config: hosted });
    case 'openrouter':
      return new OpenRouterProvider({ provider: 'openrouter', config: hosted });
    case 'anthropic':
      return new AnthropicProvider({ provider: 'anthropic', config: hosted });
    case 'gemini':
      return new GeminiProvider({ provider: 'gemini', config: hosted });
    case 'deepseek':
      return new DeepSeekProvider({ provider: 'deepseek', config: hosted });
    case 'fireworksai':
      return new FireworksAIProvider({ provider: 'fireworksai', config: hosted });
    case 'minimax':
      return new MiniMaxProvider({ provider: 'minimax', config: hosted });
    case 'moonshotai':
      return new MoonshotProvider({ provider: 'moonshotai', config: hosted });
    case 'novita':
      return new NovitaProvider({ provider: 'novita', config: hosted });
    case 'togetherai':
      return new TogetherAIProvider({ provider: 'togetherai', config: hosted });
    case 'xai':
      return new XAIProvider({ provider: 'xai', config: hosted });
    case 'bedrock':
      return new BedrockProvider({
        provider: 'bedrock',
        config: { apiKey: config.apiKey, region: config.region, model: config.model },
      });
    case 'generic-openai':
      return new OpenAICompatible({ provider: 'generic-openai', config: selfHosted });
    case 'litellm':
      return new LiteLLMProvider({ provider: 'litellm', config: selfHosted });
    case 'localai':
      return new LocalAIProvider({ provider: 'localai', config: selfHosted });
    case 'lemonade':
      return new LemonadeProvider({ provider: 'lemonade', config: selfHosted });
    case 'lmstudio':
      return new LMStudioProvider({ provider: 'lmstudio', config: { baseURL: config.baseUrl, model: config.model } });
    case 'ollama':
      return new OllamaProvider({ provider: 'ollama', config: { baseURL: config.baseUrl, model: config.model } });
    case 'native':
      return OnDeviceProvider.getInstance({
        config: { model: config.model }
      })
    default:
      throw new Error(`Provider ${provider} not supported`);
  }
}

export default getLLM;
