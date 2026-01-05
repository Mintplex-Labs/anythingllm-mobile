import { Linking, Text, TouchableOpacity, View } from 'react-native';
import SafeView from '@/components/SafeView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native-gesture-handler';
import {
  ArrowLeft,
  CaretRight,
  File,
  DiscordLogo,
  FileText,
  FileLock,
  GithubLogo,
  MoneyWavy,
} from 'phosphor-react-native';
import { IWorkspacePageKey } from '../index';
import uiStore from '@/store/UIStore';
import { PATHS } from '@/utils/paths';
import useHighjackBackButtonPress from '@/hooks/useHighjackBackButtonPress';
import AwaitableAlert from '@/components/AwaitableAlert';
import { useRef } from 'react';
import { useNavigation } from '@react-navigation/native';
import useLLMPreference from '@/hooks/useLLMPreference';
import { startCase } from 'lodash';
import Workspace from '@/database/models/Workspace';
import WorkspaceThread from '@/database/models/WorkspaceThread';
import Document from '@/database/models/Document';
import WorkspaceChat from '@/database/models/WorkspaceChat';
import uninstallAllModels from '@/utils/models/manager';
import { deleteProcessedFiles } from '@/utils/fs';
import { showToast } from '@/utils/Notification';
import ApkVersion from './ApkVersion';

interface MainViewProps {
  goToPage: (page: IWorkspacePageKey) => void;
}

type SupportLink = {
  title: string;
  link?: string;
  icon: React.ReactNode;
  onPress?: (() => void) | null;
  borderBottom?: boolean;
}

function parsedModelName(modelName: string) {
  if (!modelName) return null;
  return modelName
    .split('/')
    .pop()
    ?.replaceAll(new RegExp('(-?)(gguf|GGUF|Gguf)$', 'g'), '') // Remove -gguf suffix
    ?.replaceAll(new RegExp('-', 'g'), ' ') // Replace - with space
    ?.replace(/^./, str => startCase(str)); // Capitalize first letter
}

const ABOUT_LINKS: SupportLink[] = [
  {
    title: 'Star on GitHub',
    link: "https://github.com/Mintplex-Labs/Anything-LLM",
    icon: <GithubLogo size={18} color="#FFF" />,
  },
  {
    title: 'Join the Discord',
    link: 'https://discord.gg/6UyHPeGZAC',
    icon: <DiscordLogo size={18} color="#FFF" />,
  },
  {
    title: 'Become a Patron',
    link: "https://donate.stripe.com/6oU9ATe44f4F1NBeSh1B601",
    icon: <MoneyWavy size={18} color="#FFF" />,
  },
]

const UTILITY_LINKS: SupportLink[] = [
  {
    title: 'Clear temporary files',
    icon: <File size={18} color="#FFF" />,
    onPress: async () => {
      await deleteProcessedFiles();
      showToast('Temporary files cleared');
    },
  },
]

const LEGAL_LINKS: SupportLink[] = [
  {
    title: 'Terms of Service',
    link: 'https://docs.anythingllm.com/mobile/terms',
    icon: <FileText size={18} color="#FFF" />,
  },
  {
    title: 'Privacy Policy',
    link: 'https://docs.anythingllm.com/mobile/privacy',
    icon: <FileLock size={18} color="#FFF" />,
  },
]

export function MainView({ goToPage }: MainViewProps) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { llmPreferences, providerToName } = useLLMPreference();
  const scrollViewRef = useRef<ScrollView>(null);
  function goBack() {
    navigation.reset({
      index: 0,
      // @ts-ignore
      routes: [{ name: PATHS.home }],
    });
    return true;
  }
  async function resetAnythingLLM() {
    const confirm = await AwaitableAlert(
      'Reset AnythingLLM',
      `Are you sure you want to reset AnythingLLM? This will delete all your workspaces, chats, installed models, and preferences.`,
      { text: 'Cancel', style: 'cancel' },
      { text: 'Yes, Reset Everything', style: 'destructive' },
    );
    if (!confirm) return;
    await Promise.all([
      Workspace.deleteAll(),
      WorkspaceChat.deleteAll(),
      WorkspaceThread.deleteAll(),
      Document.deleteAll(true),
      uninstallAllModels(),
      deleteProcessedFiles(),
    ]);
    await uiStore.resetAllStorage();
    navigation.reset({
      index: 0,
      // @ts-ignore
      routes: [{ name: PATHS.onboarding.welcome }],
    });
    return true;
  }
  useHighjackBackButtonPress(goBack);

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
          Settings
        </Text>
      </View>

      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerClassName="flex flex-col justify-between"
        contentContainerStyle={{
          paddingHorizontal: 8,
          paddingBottom: insets.bottom + 20,
          gap: 24,
          flexGrow: 1,
        }}>
        <View className="w-full flex flex-col" style={{ gap: 24 }}>
          {/* Selected Provider and Model */}
          <View className="w-full flex flex-col" style={{ gap: 12 }}>
            <Text style={{ color: '#9F9FA0' }} className="text-sm uppercase">
              LLM Preference
            </Text>
            <TouchableOpacity
              style={{ backgroundColor: '#27282A', padding: 14, gap: 20 }}
              className="w-full flex flex-row items-center rounded-lg"
              onPress={() => goToPage('advanced_model_preferences')}>
              <View className="flex flex-row gap-2 items-center">
                <Text className="text-white text-lg">
                  {providerToName(llmPreferences.provider)}
                </Text>
              </View>
              <View className="flex flex-1 flex-row gap-2 items-center justify-between">
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={{ color: '#9F9FA0' }}
                  className="text-lg flex-1 text-right">
                  {parsedModelName(llmPreferences.config.model)}
                </Text>
                <CaretRight size={18} color="#FFF" />
              </View>
            </TouchableOpacity>
            <Text style={{ color: '#9F9FA0' }} className="text-sm">
              This is the LLM preference that will be used for all workspaces.
              You can change it to use a different LLM provider or on-device
              model.
            </Text>
          </View>

          {/* About AnythingLLM */}
          <View className="w-full flex flex-col" style={{ gap: 12 }}>
            <ApkVersion />
            <View
              className="flex flex-col"
              style={{
                backgroundColor: '#1B1B1E',
                padding: 14,
                gap: 12,
                borderRadius: 8,
              }}>
              {ABOUT_LINKS.map((link, index) => {
                return (
                  <SupportItem
                    key={index}
                    title={link.title}
                    link={link.link}
                    icon={link.icon}
                    onPress={link.onPress}
                    borderBottom={index !== ABOUT_LINKS.length - 1}
                  />
                );
              })}
            </View>
          </View>

          <View className="w-full flex flex-col" style={{ gap: 12 }}>
            <View className="flex flex-row items-end justify-between">
              <Text style={{ color: '#9F9FA0' }} className="text-sm uppercase">
                Utility
              </Text>
            </View>
            <View
              className="flex flex-col"
              style={{
                backgroundColor: '#1B1B1E',
                padding: 14,
                gap: 12,
                borderRadius: 8,
              }}>
              {UTILITY_LINKS.map((link, index) => {
                return (
                  <SupportItem
                    key={index}
                    title={link.title}
                    link={link.link}
                    icon={link.icon}
                    onPress={link.onPress}
                    borderBottom={index !== UTILITY_LINKS.length - 1}
                  />
                );
              })}
            </View>
          </View>

          <View className="w-full flex flex-col" style={{ gap: 12 }}>
            <View className="flex flex-row items-end justify-between">
              <Text style={{ color: '#9F9FA0' }} className="text-sm uppercase">
                Legal & Privacy
              </Text>
            </View>
            <View
              className="flex flex-col"
              style={{
                backgroundColor: '#1B1B1E',
                padding: 14,
                gap: 12,
                borderRadius: 8,
              }}>
              {LEGAL_LINKS.map((link, index) => {
                return (
                  <SupportItem
                    key={index}
                    title={link.title}
                    link={link.link}
                    icon={link.icon}
                    onPress={link.onPress}
                    borderBottom={index !== LEGAL_LINKS.length - 1}
                  />
                );
              })}
            </View>
          </View>
        </View>

        <View className="w-full flex flex-col" style={{ gap: 12 }}>
          <TouchableOpacity
            onPress={resetAnythingLLM}
            style={{ backgroundColor: 'rgba(122,39,26,0.2)' }}
            className="flex flex-row items-center justify-center rounded-lg p-4 mb-4">
            <Text style={{ color: '#F97066' }} className="text-lg font-medium">
              Reset AnythingLLM
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeView>
  );
}

function SupportItem({
  title,
  link,
  icon,
  borderBottom = true,
  onPress = null,
}: {
  title: string;
  link?: string;
  icon: React.ReactNode;
  borderBottom?: boolean;
  onPress?: (() => void) | null;
}) {
  return (
    <TouchableOpacity
      className="flex flex-row items-center gap-2"
      style={{
        borderBottomWidth: borderBottom ? 1 : 0,
        borderBottomColor: '#27282A',
        paddingBottom: borderBottom ? 12 : 0,
      }}
      onPress={onPress ? onPress : () => Linking.openURL(link ?? '')}>
      {icon}
      <Text className="text-white text-lg">{title}</Text>
    </TouchableOpacity>
  );
}