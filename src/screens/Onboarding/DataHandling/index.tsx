import React, { useState } from "react";
import { ActivityIndicator, Image, ImageBackground, Text, TouchableOpacity, View } from "react-native";
import SafeView from "@/components/SafeView";
import ProgressBars from "@/components/Onboarding/ProgressBars";
import uiStore from "@/store/UIStore";
import { PATHS } from "@/utils/paths";
import { useNavigation } from "@react-navigation/native";
import useLlmPreference from "@/hooks/useLLMPreference";
import { FileDashed, Sparkle } from "phosphor-react-native";
import Workspace from "@/database/models/Workspace";
import { EMBEDDING_MODEL, resolveDestinationPathFromGGUFUrl } from "@/utils/models/defaults";
import * as RNFS from '@dr.pogodin/react-native-fs';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Telemetry from "@/utils/Telemetry";

export default function DataHandling() {
  const navigation = useNavigation();
  const { isLoading } = useLlmPreference();
  const [isOnboarding, setIsOnboarding] = useState(false);
  const insets = useSafeAreaInsets();

  const onContinue = async () => {
    setIsOnboarding(true);
    async function onboardingTasks() {
      const workspace = await Workspace.create({ name: 'My Workspace' });
      return workspace;
    }
    async function waitAtLeast(ms: number) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Wait at least 3 seconds on this page just for the user to see the progress
    const [workspace] = await Promise.all([
      onboardingTasks(),
      waitAtLeast(3000),
    ]);

    uiStore.setToStorage('onboarding_data_handling_completed', true);
    uiStore.emitGlobalEvent(uiStore.globalEvents.ONBOARDING_COMPLETED);
    Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ONBOARDING.COMPLETED);
    console.log(`Navigating to workspace chat: ${workspace.slug} / ${workspace.threads[0].slug}`);
    // @ts-ignore-next-line
    navigation.navigate(PATHS.workspace_chat, { wsSlug: workspace.slug, threadSlug: workspace.threads[0].slug });
  }

  if (isLoading) {
    return (
      <SafeView scrollable={false} containerClassNames='flex h-[100vh] justify-center items-center'>
        <ActivityIndicator size="large" animating={true} color="#fff" />
      </SafeView>
    )
  }

  if (isOnboarding) {
    return (
      <React.Fragment>
        <ImageBackground
          source={require("@/assets/onboarding/bg-blobs.png")}
          style={{ backgroundColor: "#131314", position: "absolute", top: 0, left: 0, width: "100%", height: "100%", zIndex: 0 }}
        />

        <SafeView scrollable={false} safeAreaClassNames="bg-transparent" containerClassNames="h-full z-[1]" containerStyle={{ paddingTop: insets.top + 20 }}>
          <View className="flex flex-col gap-y-1 items-center my-auto">
            <Image source={require('@/assets/logo/anything-llm.png')} resizeMode="contain" className="w-[70vw]" />
            <View className="flex flex-row gap-x-2 items-center -mt-8">
              <ActivityIndicator size="small" animating={true} color="#fff" />
              <Text className="text-white text-xl text-center animate-pulse">Setting up your first workspace</Text>
            </View>
          </View>
        </SafeView >
      </React.Fragment>
    )
  }

  return (
    <React.Fragment>
      <ImageBackground
        source={require("@/assets/onboarding/bg-blobs.png")}
        style={{ backgroundColor: "#131314", position: "absolute", top: 0, left: 0, width: "100%", height: "100%", zIndex: 0 }}
      />

      <SafeView scrollable={false} safeAreaClassNames="bg-transparent" containerClassNames="h-full z-[1]" containerStyle={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }}>
        <View className="flex flex-col h-full justify-between">
          <ProgressBars numberOfBars={3} activeBar={3} />

          <React.Fragment>
            <View className="flex flex-col gap-y-4 justify-center items-center">
              <Text className="text-white text-4xl font-bold text-center">Data Handling & Privacy</Text>
              <Text className="text-white/60 text-xl text-center">
                With AnythingLLM, all chats, documents, and other data is processed and stored on your device.
              </Text>
            </View>

            <View className="flex flex-col gap-y-4 items-center">
              <PrivacyItem
                name="Fully Local Chats"
                description="All chats are stored on your device."
                image={<Image source={require('@/assets/logo/anything-llm-infinity.png')} className="w-[34px] h-[34px]" resizeMode="contain" />}
              />
              <PrivacyItem
                name="Document Embedding"
                description="All documents and processing are done on your device."
                Icon={<FileDashed size={34} color="#FFF" />}
              />
              <PrivacyItem
                name="AI Agents"
                description="All agents are run on your device and only use the internet when required (eg: Web search) "
                Icon={<Sparkle size={34} color="#FFF" />}
              />
            </View>

            <View className="flex flex-row gap-x-4 items-center justify-between">
              <TouchableOpacity onPress={onContinue} className="w-full bg-[--cta-light-blue] rounded-lg px-4 py-2 flex flex-row items-center justify-center">
                <Text className="text-black text-xl">Experience AnythingLLM</Text>
              </TouchableOpacity>
            </View>
          </React.Fragment>
        </View>
      </SafeView>
    </React.Fragment >
  );
};

function PrivacyItem({ name, description, image, Icon }: { name: string, description: string, image?: any, Icon?: React.ReactNode }) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={{ width: '90%', maxWidth: 380, maxHeight: 82, padding: 10, }}
      className={`flex flex-row rounded-lg gap-x-4 items-center`}
      disabled={true}
    >
      <View style={{ width: 48, height: 48 }} className="shrink-0 grow-0 rounded-lg flex items-center justify-center">
        {image && image}
        {Icon && Icon}
      </View>
      <View className="flex flex-col gap-y-1 max-w-[80%] word-break-all">
        <Text className="text-white text-xl font-bold word-break-all">{name}</Text>
        <Text className="text-white/60 text-sm">{description}</Text>
      </View>
    </TouchableOpacity>
  )
}

async function downloadEmbeddingModel() {
  try {
    console.log('Downloading embedding model now to save time later...');
    const localStorageDestination = resolveDestinationPathFromGGUFUrl(EMBEDDING_MODEL.tag);
    const fileExists = await RNFS.exists(localStorageDestination);
    if (fileExists) {
      console.log('Model already exists!');
      return true;
    } else {
      const directory = localStorageDestination.split('/').slice(0, -1).join('/');
      console.log('Creating directory', directory);
      await RNFS.mkdir(directory);
    }

    return RNFS.downloadFile({
      fromUrl: EMBEDDING_MODEL.tag,
      toFile: localStorageDestination,
      progress: (res) => {
        const progress = (res.bytesWritten / res.contentLength) * 100;
        console.log('progress', progress);
      }
    }).promise.then(() => true).catch(() => false);
  } catch (error) {
    console.log('downloadEmbeddingModel:error', error)
    return false;
  }
}