import { Text, TouchableOpacity, View } from "react-native";
import SafeView from "@/components/SafeView";
import TopBar from "@/components/TopBar";
import { NativeEventEmitter } from "react-native";
import Workspace from "@/database/models/Workspace";
import { useNavigation } from "@react-navigation/native";
import { PATHS } from "@/utils/paths";
import useRedirect from "@/hooks/useRedirect";

const eventEmitter = new NativeEventEmitter();
export default function Home() {
  useRedirect();
  const navigation = useNavigation();

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
    <SafeView scrollable={false} >
      <TopBar />
      <View className="flex flex-col h-[90vh] justify-center items-center gap-y-4">
        <View className="flex flex-col items-center justify-center gap-y-1">
          <Text className="text-2xl font-bold text-white">Welcome to AnythingLLM</Text>
          <Text className="text-white text-center">
            Get started by creating a new workspace.
          </Text>
        </View>
        <TouchableOpacity style={{ minWidth: 117 }} className="rounded-lg p-2 border border-white py-2 px-4" onPress={createWorkspace}>
          <Text className="text-white text-xl">Create Workspace</Text>
        </TouchableOpacity>
      </View>
    </SafeView>
  );
};
