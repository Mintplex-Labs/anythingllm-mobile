import { Image, Text, TouchableOpacity, View, TextInput, ScrollView } from "react-native";
import { useState, useRef, useCallback, useMemo } from "react";
import { ISelection } from "@/screens/Onboarding/ModelSelection";
import { X, Check, CaretUpDown, MagnifyingGlass } from 'phosphor-react-native';
import { AVAILABLE_LLM_PROVIDERS } from "@/utils/llmproviders";
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';

export default function ProviderSelection({ selection, onChange }: { selection: ISelection, onChange: (provider: string) => void }) {
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef(null);
  const bottomSheetRef = useRef<BottomSheetModal>(null);

  const filteredProviders = useMemo(() => AVAILABLE_LLM_PROVIDERS.filter(provider =>
    provider.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    provider.description.toLowerCase().includes(searchQuery.toLowerCase())
  ), [searchQuery]);
  const selectedProviderObject = AVAILABLE_LLM_PROVIDERS.find(p => p.value === selection.provider) ?? AVAILABLE_LLM_PROVIDERS[0];

  const handleXButton = () => {
    setSearchQuery('');
    bottomSheetRef.current?.dismiss();
  };

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
    []
  );

  return (
    <View className="flex px-4 mt-6">
      <Text className="text-lg font-bold text-white mb-4">LLM Provider</Text>
      <View className="relative">
        <BottomSheetModal
          ref={bottomSheetRef}
          index={0}
          snapPoints={['92%']}
          enableDynamicSizing={true}
          backdropComponent={renderBackdrop}
          backgroundStyle={{ backgroundColor: 'var(--secondary-bg)' }}
          handleIndicatorStyle={{ backgroundColor: 'var(--primary-button)' }}
        >
          <BottomSheetView className="flex-1 bg-[--secondary-bg] pt-4">
            <View className="flex flex-row items-center mx-4 bg-[--primary-bg] rounded-lg px-2">
              <MagnifyingGlass
                size={20}
                weight="bold"
                color="white"
              />
              <TextInput
                ref={searchInputRef}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search providers"
                placeholderTextColor="white"
                className="flex-1 w-full h-[38px] pl-12 pr-4 text-white border-none "
              />
              <TouchableOpacity onPress={handleXButton}>
                <X size={20} color="white" />
              </TouchableOpacity>
            </View>
            <ScrollView className="flex-1 px-4 py-2">
              {filteredProviders.length === 0 && (
                <Text className="text-white text-center pt-4">No providers found for "{searchQuery}"</Text>
              )}
              {filteredProviders.map((provider) => (
                <TouchableOpacity
                  key={provider.value}
                  className="flex flex-row items-center p-2 rounded-lg"
                  onPress={() => updateProviderChoice(provider.value)}
                >
                  <Image source={provider.logo} className="w-10 h-10 rounded-md" resizeMode="contain" />
                  <View className="ml-4 flex-1">
                    <Text className="text-white font-semibold">{provider.name}</Text>
                    <Text className="text-[--secondary-text] text-sm">{provider.description}</Text>
                  </View>
                  {selection.provider === provider.value && (
                    <Check size={24} color="white" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </BottomSheetView>
        </BottomSheetModal>

        <TouchableOpacity
          className="w-full h-[64px] bg-[--secondary-bg] rounded-lg flex flex-row items-center p-2 justify-between"
          onPress={() => {
            bottomSheetRef.current?.present();
          }}
        >
          <View className="flex flex-row items-center">
            <Image source={selectedProviderObject.logo} className="w-10 h-10 rounded-md" />
            <View className="ml-4">
              <Text className="text-white font-semibold">{selectedProviderObject.name}</Text>
              <Text className="text-white text-xs">{selectedProviderObject.description}</Text>
            </View>
          </View>
          <CaretUpDown size={24} weight="bold" color="white" />
        </TouchableOpacity>
      </View>
    </View>
  );
}