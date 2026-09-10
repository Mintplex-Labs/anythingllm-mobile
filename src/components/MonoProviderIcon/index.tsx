import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { SvgProps } from 'react-native-svg';

// Monochrome brand marks from https://lobehub.com/icons
// The raw svg files are shipped in @lobehub/icons-static-svg and are compiled to
// react-native-svg components by react-native-svg-transformer (see metro.config.js).
// This mirrors frontend/src/components/lib/MonoProviderIcon in the desktop app.
import OpenAI from '@lobehub/icons-static-svg/icons/openai.svg';
import Anthropic from '@lobehub/icons-static-svg/icons/anthropic.svg';
import Google from '@lobehub/icons-static-svg/icons/google.svg';
import Gemma from '@lobehub/icons-static-svg/icons/gemma.svg';
import Gemini from '@lobehub/icons-static-svg/icons/gemini.svg';
import Microsoft from '@lobehub/icons-static-svg/icons/microsoft.svg';
import Meta from '@lobehub/icons-static-svg/icons/meta.svg';
import Mistral from '@lobehub/icons-static-svg/icons/mistral.svg';
import DeepSeek from '@lobehub/icons-static-svg/icons/deepseek.svg';
import HuggingFace from '@lobehub/icons-static-svg/icons/huggingface.svg';
import Qwen from '@lobehub/icons-static-svg/icons/qwen.svg';
import IBM from '@lobehub/icons-static-svg/icons/ibm.svg';
import Bytedance from '@lobehub/icons-static-svg/icons/bytedance.svg';
import Kimi from '@lobehub/icons-static-svg/icons/kimi.svg';
import Ollama from '@lobehub/icons-static-svg/icons/ollama.svg';
import LmStudio from '@lobehub/icons-static-svg/icons/lmstudio.svg';
import OpenRouter from '@lobehub/icons-static-svg/icons/openrouter.svg';
import Liquid from '@lobehub/icons-static-svg/icons/liquid.svg';
import Menlo from '@lobehub/icons-static-svg/icons/menlo.svg';
import Unsloth from '@lobehub/icons-static-svg/icons/unsloth.svg';
import Nvidia from '@lobehub/icons-static-svg/icons/nvidia.svg';

export type MonoIcon = React.FC<SvgProps>;

/**
 * Exact provider key -> icon. Keys are lowercased before lookup so they can be
 * matched against our LLM provider values (`openai`, `ollama`, ...), the display
 * name of a model author (`IBM Research`, `Google`, ...) or a HuggingFace org
 * (`ibm-granite`, `meta-llama`, ...).
 */
const providerIcons: Record<string, MonoIcon> = {
  openai: OpenAI,
  anthropic: Anthropic,
  google: Google,
  gemma: Gemma,
  gemini: Gemini,
  microsoft: Microsoft,
  meta: Meta,
  'meta-llama': Meta,
  mistral: Mistral,
  mistralai: Mistral,
  deepseek: DeepSeek,
  'deepseek-ai': DeepSeek,
  huggingface: HuggingFace,
  huggingfacetb: HuggingFace,
  qwen: Qwen,
  qwq: Qwen,
  ibm: IBM,
  'ibm research': IBM,
  'ibm-granite': IBM,
  bytedance: Bytedance,
  kimi: Kimi,
  moonshotai: Kimi,
  ollama: Ollama,
  lmstudio: LmStudio,
  openrouter: OpenRouter,
  liquid: Liquid,
  liquidai: Liquid,
  menlo: Menlo,
  unsloth: Unsloth,
  nvidia: Nvidia,
};

/**
 * Model name patterns, checked in order. First match wins.
 * Matched against the model name/tag without its HuggingFace org prefix,
 * eg: `Qwen3.5-2B-GGUF`, `granite-4.2-3b`, `gpt-4o`, `Lucy-gguf`.
 */
const modelPatterns: { pattern: RegExp; icon: MonoIcon }[] = [
  { pattern: /^gpt/i, icon: OpenAI },
  { pattern: /^o\d+/i, icon: OpenAI }, // o1, o3, ...
  { pattern: /^claude-/i, icon: Anthropic },
  { pattern: /^gemini-/i, icon: Gemini },
  { pattern: /gemma/i, icon: Gemma },
  { pattern: /llama/i, icon: Meta },
  { pattern: /^meta/i, icon: Meta },
  { pattern: /^(mistral|devstral|mixtral|magistral|codestral|ministral)/i, icon: Mistral },
  { pattern: /^deepseek/i, icon: DeepSeek },
  { pattern: /^qwen/i, icon: Qwen },
  { pattern: /^qwq/i, icon: Qwen },
  { pattern: /^phi/i, icon: Microsoft },
  { pattern: /^granite/i, icon: IBM },
  { pattern: /^doubao/i, icon: Bytedance },
  { pattern: /^seed/i, icon: Bytedance },
  { pattern: /^moonshot/i, icon: Kimi },
  { pattern: /^kimi/i, icon: Kimi },
  { pattern: /^smol/i, icon: HuggingFace },
  { pattern: /^lfm/i, icon: Liquid },
  { pattern: /^lucy/i, icon: Menlo },
  { pattern: /^nemotron/i, icon: Nvidia },
];

function stripOrg(modelName: string) {
  // "unsloth/Qwen3.5-2B-GGUF" -> "Qwen3.5-2B-GGUF", plain names pass through untouched.
  return modelName.split('/').pop() || modelName;
}

function orgOf(modelName: string) {
  const parts = modelName.split('/');
  return parts.length > 1 ? parts[0] : null;
}

export function findIconByProvider(provider?: string | null): MonoIcon | null {
  if (!provider) return null;
  return providerIcons[provider.trim().toLowerCase()] || null;
}

export function findIconByModelName(modelName?: string | null): MonoIcon | null {
  if (!modelName) return null;
  const name = stripOrg(modelName);
  const match = modelPatterns.find(({ pattern }) => pattern.test(name));
  if (match) return match.icon;
  // Nothing matched the model itself - fall back to the org it was published under.
  return findIconByProvider(orgOf(modelName));
}

/**
 * Resolves the best mono icon for a model. The model name is checked first since it
 * is the most specific (a Qwen model published by unsloth should show the Qwen mark),
 * then the provider/author, then the org in the model id.
 */
export function findMonoProviderIcon({
  provider,
  modelName,
}: {
  provider?: string | null;
  modelName?: string | null;
}): MonoIcon | null {
  return findIconByModelName(modelName) || findIconByProvider(provider);
}

/**
 * @param provider - Provider key or display name for an exact match (`openai`, `IBM Research`, ...).
 * @param modelName - Model name or id for pattern matching (`unsloth/Qwen3.5-2B-GGUF`, `gpt-4o`, ...).
 * @param fallback - Rendered when nothing matches. Defaults to `null`.
 */
export default function MonoProviderIcon({
  provider,
  modelName,
  size = 24,
  color = '#000000',
  style,
  fallback = null,
}: {
  provider?: string | null;
  modelName?: string | null;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  fallback?: React.ReactNode;
}) {
  const Icon = findMonoProviderIcon({ provider, modelName });
  if (!Icon) return <>{fallback}</>;
  // The lobehub svgs are authored for the web (`fill="currentColor"`, a flex style, 1em sizing).
  // `color` drives currentColor in react-native-svg and passing `style` replaces the web-only style block.
  return <Icon width={size} height={size} color={color} style={style ?? {}} />;
}
