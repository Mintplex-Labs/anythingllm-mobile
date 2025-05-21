import { View, Text } from "react-native";
import useTheme from "@/hooks/useTheme";
import { createStyles } from "./style";
import SafeView from "@/components/SafeView";

export default function OnboardingWelcome() {
  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <SafeView
      scrollable={false}
      safeAreaStyles={{ backgroundColor: theme.colors.anythingllm.background.primary }}
    >
      <View style={{
        backgroundColor: 'blue',
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <Text style={{
          color: theme.colors.anythingllm.text.primary,
          fontSize: 20,
          fontWeight: 'bold',
        }}>
          Welcome
        </Text>
      </View>
    </SafeView>
    // <ChatView
    //   renderBubble={renderBubble}
    //   messages={chatSessionStore.currentSessionMessages}
    //   onSendPress={handleSendPress}
    //   onStopPress={handleStopPress}
    //   user={user}
    //   isStopVisible={modelStore.inferencing}
    //   isThinking={isThinking}
    //   isStreaming={modelStore.isStreaming}
    //   sendButtonVisibilityMode="editing"
    //   textInputProps={{
    //     editable: !!modelStore.context,
    //     placeholder: !modelStore.context
    //       ? modelStore.isContextLoading
    //         ? l10n.chat.loadingModel
    //         : l10n.chat.modelNotLoaded
    //       : l10n.chat.typeYourMessage,
    //   }}
    // />
  );
};
