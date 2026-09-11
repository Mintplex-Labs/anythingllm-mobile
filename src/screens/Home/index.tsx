import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import SafeView from "@/components/SafeView";
import TopBar from "@/components/TopBar";
import { NativeEventEmitter } from "react-native";
import Workspace from "@/database/models/Workspace";
import { useNavigation } from "@react-navigation/native";
import { PATHS } from "@/utils/paths";
import useRedirect from "@/hooks/useRedirect";
import { useEffect, useState } from "react";
import { resolveDefaultChatRoute } from "@/utils/defaultChatRoute";

const eventEmitter = new NativeEventEmitter();

/**
 * Empty-state screen: only meant to be seen when no workspaces exist.
 * If any do, it immediately hands off to the thread the user last chatted in
 * so this screen never sits in front of an existing conversation.
 */
export default function Home() {
  useRedirect();
  const navigation = useNavigation();
  const [checkingWorkspaces, setCheckingWorkspaces] = useState(true);

  useEffect(() => {
    let cancelled = false;
    resolveDefaultChatRoute().then((route) => {
      if (cancelled) return;
      if (!route) return setCheckingWorkspaces(false);
      navigation.reset({
        index: 0,
        // @ts-ignore
        routes: [{ name: PATHS.workspace_chat, params: route }],
      });
    });
    return () => { cancelled = true; };
  }, []);

  async function createWorkspace() {
    await Workspace.create({ name: 'My Workspace' })
      .then((workspace) => {
        eventEmitter.emit('workspaceUpdate', {
          type: 'add-workspace',
          details: {
            name: workspace.name,
            slug: workspace.slug,
            createdAt: workspace.createdAt,
            threads: workspace.threads,
          },
        });

        // @ts-ignore
        navigation.navigate(PATHS.workspace_chat, { wsSlug: workspace.slug, threadSlug: workspace.threads[0].slug });
      })
      .catch((error) => {
        console.error(error);
      });
  }

  return (
    <SafeView scrollable={false} safeAreaClassNames="pt-[21px]" containerClassNames="flex-1 flex flex-col" safeAreaStyle={{ backgroundColor: '#000' }} applyGradient>
      <TopBar />
      {/* flex-1 centers within the space left under the top bar - a fixed 90vh box sat below true center */}
      <View className="flex-1 flex flex-col justify-center items-center gap-y-4">
        {checkingWorkspaces ? (
          <ActivityIndicator size="large" color="#fff" />
        ) : (
          <>
            <View className="flex flex-col items-center justify-center gap-y-1">
              <Text className="text-2xl font-bold text-white">Welcome to AnythingLLM</Text>
              <Text className="text-white text-center">
                Get started by creating a new workspace.
              </Text>
            </View>
            <TouchableOpacity activeOpacity={0.8} style={{ minWidth: 200 }} className="rounded-lg bg-white/10  py-2 px-4" onPress={createWorkspace}>
              <Text className="text-white text-center text-xl">Create Workspace</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeView>
  );
};
