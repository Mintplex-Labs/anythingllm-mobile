import React from 'react';
import { View, Text } from 'react-native';
import type { IOnDeviceAvailableModel } from '@/utils/AiProviders/onDevice';

export const UNKNOWN_PROVIDER_LABEL = 'Found on this device';
export const IMPORTED_PROVIDER_LABEL = 'Added from Hugging Face';
export const OTHER_PROVIDER_LABEL = 'Other';
/** Providers listed first, in this order, before the remaining providers are sorted alphabetically. */
export const PINNED_PROVIDERS = ['Qwen'];

export type ModelSection<T extends IOnDeviceAvailableModel = IOnDeviceAvailableModel> = {
  /** Section title. `null` for the leading preset section which has no header. */
  title: string | null;
  models: T[];
};

/**
 * Groups on-device models for display:
 *  1. Preset models first, with no header.
 *  2. Everything else grouped by provider, pinned providers (Qwen) first then the rest alphabetically.
 *  3. Models the user added from Hugging Face.
 *  4. Models discovered in storage that we know nothing about, last.
 */
export function groupModelsByProvider<T extends IOnDeviceAvailableModel>(models: T[]): ModelSection<T>[] {
  const presets: T[] = [];
  const imported: T[] = [];
  const unknown: T[] = [];
  const byProvider = new Map<string, T[]>();

  for (const model of models) {
    if (model.isPreset) {
      presets.push(model);
    } else if (model.isImported) {
      imported.push(model);
    } else if (model.isUnknown) {
      unknown.push(model);
    } else {
      const provider = model.provider?.trim() || OTHER_PROVIDER_LABEL;
      if (!byProvider.has(provider)) byProvider.set(provider, []);
      byProvider.get(provider)!.push(model);
    }
  }

  const sections: ModelSection<T>[] = [];
  if (presets.length) sections.push({ title: null, models: presets });

  const rank = (provider: string) => {
    const pinned = PINNED_PROVIDERS.indexOf(provider);
    if (pinned !== -1) return pinned; // pinned providers first, in their listed order
    if (provider === OTHER_PROVIDER_LABEL) return Number.MAX_SAFE_INTEGER; // "Other" always last
    return PINNED_PROVIDERS.length;
  };
  const providers = [...byProvider.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  for (const provider of providers) sections.push({ title: provider, models: byProvider.get(provider)! });

  if (imported.length) sections.push({ title: IMPORTED_PROVIDER_LABEL, models: imported });
  if (unknown.length) sections.push({ title: UNKNOWN_PROVIDER_LABEL, models: unknown });
  return sections;
}

export type FlatModelListItem<T extends IOnDeviceAvailableModel = IOnDeviceAvailableModel> =
  | { type: 'header'; key: string; title: string }
  | { type: 'model'; key: string; model: T };

/**
 * Flattens grouped sections into a single list so they can be rendered by a FlatList.
 */
export function flattenModelSections<T extends IOnDeviceAvailableModel>(sections: ModelSection<T>[]): FlatModelListItem<T>[] {
  const items: FlatModelListItem<T>[] = [];
  sections.forEach((section, sectionIndex) => {
    if (section.title) items.push({ type: 'header', key: `header-${section.title}`, title: section.title });
    section.models.forEach((model, modelIndex) => {
      items.push({ type: 'model', key: `${sectionIndex}-${model.modelId}-${modelIndex}`, model });
    });
  });
  return items;
}

/**
 * A labelled divider used to separate provider groups in model lists.
 */
export function ProviderSectionHeader({ title }: { title: string }) {
  return (
    <View
      style={{ paddingVertical: 10, opacity: 0.75 }}
      className="w-full flex flex-row items-center justify-center">
      <View style={{ height: 1, backgroundColor: '#9F9FA0', borderRadius: 100 }} className="flex flex-1 w-full" />
      <Text style={{ fontSize: 12, color: '#9F9FA0', paddingHorizontal: 10 }} className="text-sm">
        {title}
      </Text>
      <View style={{ height: 1, backgroundColor: '#9F9FA0', borderRadius: 100 }} className="flex flex-1 w-full" />
    </View>
  );
}
