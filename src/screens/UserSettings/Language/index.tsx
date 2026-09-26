import { useMemo, useState } from 'react';
import { FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, CheckCircle, MagnifyingGlass, X } from 'phosphor-react-native';
import { useTranslation } from 'react-i18next';
import SafeView from '@/components/SafeView';
import useHighjackBackButtonPress from '@/hooks/useHighjackBackButtonPress';
import { showToast } from '@/utils/Notification';
import { LANGUAGES, currentLanguage, setLanguage, type Language } from '@/i18n';
import { IWorkspacePageKey } from '../index';

interface LanguageSettingsProps {
  goToPage: (page: IWorkspacePageKey) => void;
}

// Fixed row height so the list can open scrolled to the current language (getItemLayout).
const ROW_HEIGHT = 64;

function matchesQuery(lang: Language, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [lang.nativeName, lang.englishName, lang.code].some(value =>
    value.toLowerCase().includes(q),
  );
}

/**
 * Settings > Language: every bundled UI language with a search bar. Opens scrolled to the current
 * language; tapping one switches the app immediately, saves it for future launches and goes back.
 */
export default function LanguageSettings({ goToPage }: LanguageSettingsProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const active = currentLanguage();
  const goBack = () => {
    goToPage('main');
    return true;
  };
  useHighjackBackButtonPress(goBack);

  const languages = useMemo(() => LANGUAGES.filter(lang => matchesQuery(lang, query)), [query]);
  const activeIndex = languages.findIndex(lang => lang.code === active);

  async function choose(lang: Language) {
    if (lang.code !== active) {
      await setLanguage(lang.code);
      showToast(t('language.changed', { language: lang.nativeName }));
    }
    goBack();
  }

  return (
    <SafeView
      scrollable={false}
      safeAreaClassNames="pt-[21px]"
      containerClassNames="flex flex-col flex-1"
      safeAreaStyle={{ backgroundColor: '#0E0F0F' }}>
      {/* Header */}
      <View
        style={{ paddingTop: insets.top, paddingBottom: 20 }}
        className="w-full flex flex-row items-center justify-center relative">
        <TouchableOpacity onPress={goBack} className="absolute left-0 flex flex-row items-center gap-2">
          <ArrowLeft size={24} color="#FFF" weight="bold" />
        </TouchableOpacity>
        <Text className="text-white text-lg font-medium">{t('language.title')}</Text>
      </View>

      <View className="flex flex-row items-center mx-2 mb-4 bg-[#27282A] rounded-lg px-4">
        <MagnifyingGlass size={20} weight="bold" color="white" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('language.search_placeholder')}
          placeholderTextColor="#9F9FA0"
          className="flex-1 h-[44px] ml-2 text-white"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <X size={20} color="white" />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={languages}
        keyExtractor={lang => lang.code}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: insets.bottom + 20 }}
        getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
        // Only on mount - searching resets to the top of the filtered list.
        initialScrollIndex={!query && activeIndex > 2 ? activeIndex - 2 : undefined}
        ListEmptyComponent={
          <Text className="text-center pt-4" style={{ color: '#9F9FA0' }}>
            {t('language.no_results', { query })}
          </Text>
        }
        renderItem={({ item }) => {
          const selected = item.code === active;
          return (
            <View style={{ height: ROW_HEIGHT, paddingBottom: 8 }}>
              <TouchableOpacity
                onPress={() => choose(item)}
                className="flex-1 flex flex-row items-center justify-between rounded-lg px-4"
                style={{
                  backgroundColor: selected ? '#27282A' : '#1B1B1E',
                  borderWidth: 1,
                  borderColor: selected ? '#36bffa' : 'transparent',
                }}>
                <View className="flex-1">
                  <Text className="text-white text-lg" numberOfLines={1}>
                    {item.nativeName}
                  </Text>
                  {item.englishName !== item.nativeName && (
                    <Text className="text-sm" style={{ color: '#9F9FA0' }} numberOfLines={1}>
                      {item.englishName}
                    </Text>
                  )}
                </View>
                {selected && <CheckCircle size={22} color="#36bffa" weight="fill" />}
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </SafeView>
  );
}
