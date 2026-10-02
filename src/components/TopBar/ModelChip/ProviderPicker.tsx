import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { ArrowLeft, CaretDown, Check, MagnifyingGlass, PencilSimple, X } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import ExperimentalBadge from '@/components/LLMSelection/ExperimentalBadge';
import {
  AVAILABLE_LLM_PROVIDERS,
  findProviderDefinition,
  groupProvidersForPicker,
  type LLMProviderDefinition,
  providerDisplayName,
} from '@/utils/llmproviders';

/**
 * Row above the model list showing the active provider - tapping it opens the provider picker
 * so the user can swap providers without leaving the chat.
 */
export function ProviderBar({ provider, onPress }: { provider: string; onPress: () => void }) {
  const { t } = useTranslation();
  const definition = findProviderDefinition(provider);
  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex flex-row items-center bg-[#27282A] rounded-lg px-3 mx-5"
      style={{ height: 44, gap: 10, alignSelf: 'stretch' }}>
      {definition?.logo && (
        <Image source={definition.logo} style={{ width: 24, height: 24 }} className="rounded-md" resizeMode="contain" />
      )}
      <Text className="text-white text-base flex-1" numberOfLines={1}>
        {definition ? providerDisplayName(provider) : t('top_bar.model_chip.choose_provider')}
      </Text>
      <Text className="text-[#9F9FA0] text-sm">{t('top_bar.model_chip.switch_provider')}</Text>
      <CaretDown size={14} color="#9F9FA0" weight="bold" />
    </TouchableOpacity>
  );
}

/**
 * Condensed provider list for the model chip sheet. Providers that are ready to use (on-device plus
 * any with saved credentials) are pinned to the top so swapping between them is a single tap.
 */
export default function ProviderPicker({
  currentProvider,
  configuredProviders,
  disabled,
  onSelect,
  onEdit,
  onBack,
}: {
  currentProvider: string;
  configuredProviders: string[];
  disabled?: boolean;
  onSelect: (provider: string) => void;
  onEdit: (provider: string) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');

  const sections = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matches = AVAILABLE_LLM_PROVIDERS.filter(
      p => !query || p.name.toLowerCase().includes(query) || t(p.description).toLowerCase().includes(query),
    );
    // On-device needs no credentials, so it is always ready to switch to.
    const ready = new Set(['native', ...configuredProviders]);
    const pinned = groupProvidersForPicker(matches.filter(p => ready.has(p.value))).flatMap(s => s.providers);
    const rest = groupProvidersForPicker(matches.filter(p => !ready.has(p.value)));
    return [
      ...(pinned.length ? [{ title: 'top_bar.model_chip.configured', providers: pinned, pinned: true }] : []),
      ...rest.map(section => ({ ...section, pinned: false })),
    ];
  }, [searchQuery, configuredProviders, t]);

  const renderRow = (provider: LLMProviderDefinition, pinned: boolean) => {
    const isSelected = provider.value === currentProvider;
    const canEdit = provider.value !== 'native' && (pinned || isSelected);
    return (
      <TouchableOpacity
        key={provider.value}
        disabled={disabled}
        onPress={() => onSelect(provider.value)}
        className="flex flex-row items-center w-full rounded-lg px-2"
        style={{
          paddingVertical: pinned ? 8 : 10,
          gap: 12,
          backgroundColor: isSelected ? '#2e404b' : 'transparent',
        }}>
        <Image source={provider.logo} style={{ width: 32, height: 32 }} className="rounded-lg" resizeMode="contain" />
        <View className="flex-1">
          <View className="flex flex-row items-center" style={{ gap: 6 }}>
            <Text className="text-white text-base flex-shrink" numberOfLines={1}>{providerDisplayName(provider.value)}</Text>
            {provider.experimental && <ExperimentalBadge />}
          </View>
          {!pinned && (
            <Text className="text-[#9F9FA0] text-xs" numberOfLines={1}>{t(provider.description)}</Text>
          )}
        </View>
        {canEdit && (
          <TouchableOpacity
            disabled={disabled}
            onPress={() => onEdit(provider.value)}
            hitSlop={10}
            accessibilityLabel={t('top_bar.model_chip.edit_connection')}
            style={{ padding: 4 }}>
            <PencilSimple size={18} color="#9F9FA0" />
          </TouchableOpacity>
        )}
        {isSelected && <Check size={20} color="#7cd4fd" weight="bold" />}
      </TouchableOpacity>
    );
  };

  return (
    <View className="flex-1 w-full">
      <View className="flex flex-row items-center px-5 pb-3" style={{ gap: 12 }}>
        <TouchableOpacity onPress={onBack} hitSlop={10} accessibilityLabel={t('common.back')}>
          <ArrowLeft size={22} color="white" weight="bold" />
        </TouchableOpacity>
        <Text className="text-white text-lg font-semibold flex-1">{t('top_bar.model_chip.choose_provider')}</Text>
      </View>
      <View className="flex flex-row items-center mx-5 mb-2 bg-[#27282A] rounded-lg px-4">
        <MagnifyingGlass size={20} weight="bold" color="white" />
        <BottomSheetTextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('top_bar.model_chip.search_providers')}
          placeholderTextColor="#9F9FA0"
          autoCorrect={false}
          style={{ flex: 1, height: 38, marginLeft: 8, color: 'white' }}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <X size={20} color="white" />
          </TouchableOpacity>
        )}
      </View>
      <BottomSheetScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100, gap: 4 }}
        keyboardShouldPersistTaps="handled">
        {!sections.length && (
          <Text className="text-white text-sm text-center pt-4">
            {t('llm_selection.no_providers_found', { query: searchQuery })}
          </Text>
        )}
        {sections.map(section => (
          <View key={section.title} style={{ gap: 2 }}>
            <Text className="text-[#9F9FA0] text-xs uppercase font-semibold px-2 pt-3 pb-1">
              {t(section.title)}
            </Text>
            {section.providers.map(provider => renderRow(provider, section.pinned))}
          </View>
        ))}
      </BottomSheetScrollView>
    </View>
  );
}
