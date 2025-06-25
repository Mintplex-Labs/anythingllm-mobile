import { Text, TouchableOpacity, View } from 'react-native';
import SafeView from '@/components/SafeView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native-gesture-handler';
import { ArrowLeft, CaretDown } from 'phosphor-react-native';
import { IWorkspacePageKey } from '../index';

interface AdvancedModelPreferencesProps {
  goToPage: (page: IWorkspacePageKey) => void;
}

export function AdvancedModelPreferences({
  goToPage,
}: AdvancedModelPreferencesProps) {
  const insets = useSafeAreaInsets();

  function goBack() {
    goToPage('main');
  }

  return (
    <SafeView
      scrollable={false}
      safeAreaClassNames="pt-[21px]"
      containerClassNames="flex-1 flex flex-col"
      safeAreaStyle={{ backgroundColor: '#0E0F0F' }}>
      {/* Header */}
      <View
        style={{
          paddingHorizontal: 30,
          paddingTop: insets.top,
          paddingBottom: 20,
        }}
        className="w-full flex flex-row items-center justify-center relative">
        <TouchableOpacity
          onPress={goBack}
          className="absolute left-0 flex flex-row items-center gap-2">
          <ArrowLeft size={24} color="#FFF" weight="bold" />
        </TouchableOpacity>
        <Text
          style={{ maxWidth: '80%' }}
          numberOfLines={1}
          ellipsizeMode="middle"
          className="text-white text-lg font-medium">
          Model Selection
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="flex flex-col justify-between"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: insets.bottom,
          gap: 24,
          flex: 1,
        }}>
        <View className="flex-1">
          {/* Provider Selection */}
          <View className="mb-6">
            <Text className="text-[#9F9FA0] text-sm mb-2">
              Choose an LLM Provider*
            </Text>
            <TouchableOpacity
              style={{ backgroundColor: '#27282A' }}
              className="flex-row items-center justify-between p-4 rounded-lg">
              <View className="flex-row items-center">
                <View className="w-8 h-8 bg-white rounded-lg mr-2" />
                <Text className="text-white text-lg">Quick Start</Text>
              </View>
              <CaretDown size={20} color="#FFF" />
            </TouchableOpacity>
          </View>

          {/* Model Selection */}
          <View>
            <Text className="text-[#9F9FA0] text-sm mb-2">LLM Model*</Text>
            {/* Model Items */}
            {[1, 2, 3].map((_, index) => (
              <TouchableOpacity
                key={index}
                style={{
                  backgroundColor: index === 0 ? '#27282A' : '#1B1B1E',
                  borderColor: index === 0 ? '#5CBBFF' : 'transparent',
                  borderWidth: 1,
                }}
                className="flex-row items-center p-4 rounded-lg mb-2">
                <View className="w-8 h-8 bg-white rounded-lg mr-2" />
                <View>
                  <Text className="text-white text-lg">LLama</Text>
                  <Text className="text-[#9F9FA0]">Hosted by Ollama</Text>
                </View>
              </TouchableOpacity>
            ))}

            {/* View More Button */}
            <TouchableOpacity className="mt-2">
              <Text className="text-white text-center">View More</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Bottom Buttons */}
        <View className="flex-row justify-between mb-4">
          <TouchableOpacity
            onPress={goBack}
            style={{ backgroundColor: '#27282A' }}
            className="flex-1 py-3 rounded-lg mr-2">
            <Text className="text-white text-center text-lg">Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ backgroundColor: '#5CBBFF' }}
            className="flex-1 py-3 rounded-lg ml-2">
            <Text className="text-white text-center text-lg">Continue</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeView>
  );
}
