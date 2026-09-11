import {
  Image,
  Text,
  TouchableOpacity,
  View,
  TextInput,
} from 'react-native';
import { useState, useRef, useCallback, useMemo } from 'react';
import { ISelection } from '@/screens/Onboarding/ModelSelection';
import { X, MagnifyingGlass, CaretDown, Circle } from 'phosphor-react-native';
import { AVAILABLE_LLM_PROVIDERS, groupProvidersForPicker } from '@/utils/llmproviders';
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';

export default function ProviderSelection({
  selection,
  onChange,
  excludeProviders = [],
}: {
  selection: ISelection;
  onChange: (provider: string) => void;
  /** Provider values to hide from the picker (eg: 'native' during external-provider onboarding) */
  excludeProviders?: string[];
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef(null);
  const bottomSheetRef = useRef<BottomSheetModal>(null);

  // Providers matching the search, grouped into "Local Providers" / "Cloud Providers" sections.
  const providerSections = useMemo(
    () =>
      groupProvidersForPicker(
        AVAILABLE_LLM_PROVIDERS.filter(
          provider =>
            !excludeProviders.includes(provider.value) &&
            (provider.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              provider.description
                .toLowerCase()
                .includes(searchQuery.toLowerCase())),
        ),
      ),
    [searchQuery, excludeProviders],
  );
  const hasResults = providerSections.length > 0;
  const selectedProviderObject =
    AVAILABLE_LLM_PROVIDERS.find(p => p.value === selection.provider) ??
    AVAILABLE_LLM_PROVIDERS[0];


  const updateProviderChoice = (value: string) => {
    onChange(value);
    bottomSheetRef.current?.dismiss();
  };

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.7}
      />
    ),
    [],
  );

  return (
    <View>
      <View className="relative">
        <TouchableOpacity
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', height: 68, width: '100%' }}
          className="flex-row items-center justify-between px-4 py-[14px] rounded-lg"
          onPress={() => bottomSheetRef.current?.present()}>
          <View className="flex-row items-center">
            <Image
              source={selectedProviderObject.logo}
              style={{ width: 38, height: 38 }}
              className="rounded-lg mr-3"
            />
            <Text className="text-white text-lg">
              {selectedProviderObject.name}
            </Text>
          </View>
          <CaretDown size={18} color="#FFF" weight="bold" />
        </TouchableOpacity>

        <BottomSheetModal
          ref={bottomSheetRef}
          index={0}
          snapPoints={['60%', '95%']}
          enableDynamicSizing={false}
          backdropComponent={renderBackdrop}
          backgroundStyle={{ backgroundColor: '#1B1B1E' }}
          handleIndicatorStyle={{
            backgroundColor: '#9F9FA0',
            width: 45,
            margin: 10,
          }}>
          {/* BottomSheetScrollView (not a plain ScrollView) so the list scrolls instead of dragging the sheet */}
          <BottomSheetScrollView
            className="flex-1 bg-[#1B1B1E]"
            contentContainerStyle={{ paddingBottom: 100 }}
            keyboardShouldPersistTaps="handled">
            <Text className="text-white text-lg font-semibold py-4 text-center">
              Choose your provider
            </Text>
            <View className="flex flex-row items-center mx-4 bg-[#27282A] rounded-lg px-4">
              <MagnifyingGlass size={20} weight="bold" color="white" />
              <TextInput
                ref={searchInputRef}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search"
                placeholderTextColor="#9F9FA0"
                className="flex-1 h-[38px] ml-2 text-white"
                scrollEnabled={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <X size={20} color="white" />
                </TouchableOpacity>
              )}
            </View>
            <View className="px-4 py-2" style={{ gap: 10 }}>
              {!hasResults && (
                <Text className="text-white text-center pt-4">
                  No providers found for "{searchQuery}"
                </Text>
              )}
              {providerSections.map(section => (
                <View key={section.title} style={{ gap: 10 }}>
                  <Text className="text-[#9F9FA0] text-xs uppercase font-semibold px-2 pt-2">
                    {section.title}
                  </Text>
                  {section.providers.map(provider => (
                    <TouchableOpacity
                      key={provider.value}
                      className="flex flex-row items-center justify-between w-full p-2 rounded-lg"
                      onPress={() => updateProviderChoice(provider.value)}>
                      <View className="flex flex-row items-center flex-1">
                        <Image
                          source={provider.logo}
                          style={{ width: 40, height: 40 }}
                          className="rounded-lg"
                          resizeMode="contain"
                        />
                        <View className="ml-4 flex-1">
                          <Text className="text-white text-lg">
                            {provider.name}
                          </Text>
                          {provider.description && (
                            <Text className="text-[#9F9FA0] text-sm">
                              {provider.description}
                            </Text>
                          )}
                        </View>
                      </View>
                      <View className="flex flex-row items-center justify-center">
                        {selection.provider === provider.value ? (
                          <View className="relative">
                            <Circle size={24} color="#FFF" />
                            <Circle
                              size={16}
                              color="#36bffa"
                              weight="fill"
                              style={{
                                position: 'absolute',
                                top: (24 - 16) / 2,
                                left: (24 - 16) / 2,
                              }}
                            />
                          </View>
                        ) : (
                          <Circle size={24} color="#888" />
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>
          </BottomSheetScrollView>
        </BottomSheetModal>
      </View>
    </View>
  );
}
