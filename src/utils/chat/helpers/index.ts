import { ChatMessage } from "@/screens/WorkspaceChat";
import { NativeEventEmitter } from "react-native";
const eventEmitter = new NativeEventEmitter();

export function clearTempMessages(setMessages: (messages: ChatMessage[]) => void) {
  setMessages([]);
  eventEmitter.emit('threadReset');
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, 1_500);
  });
}


export const DUMMY_MESSAGES: ChatMessage[] = [
  {
    uuid: "1",
    content: "Hello, how are you?",
    role: "user",
    createdAt: new Date(),
  },
  {
    uuid: "2",
    content: "I'm good, thank you!",
    role: "assistant",
    createdAt: new Date(),
  },
  {
    uuid: "3",
    content: "What is the capital of France?",
    role: "user",
    createdAt: new Date(),
  },
  {
    uuid: "4",
    content: "The capital of France is Paris. This is a test of a long message that should wrap around the screen. how does it look? Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
    role: "assistant",
    createdAt: new Date(),
  },
]

/**
 * Formats the chat history to re-use attachments in the chat history
 * that might have existed in the conversation earlier.
 */
export function formatChatHistory(
  chatHistory: ChatMessage[] = [],
  formatterFunction: any,
  mode: "asProperty" | "spread" = "asProperty"
) {
  return chatHistory.map((historicalMessage) => {
    if (
      historicalMessage?.role !== "user" || // Only user messages can have attachments
      !historicalMessage?.attachments || // If there are no attachments, we can skip this
      !historicalMessage.attachments.length // If there is an array but it is empty, we can skip this
    ) return {
      role: historicalMessage.role,
      content: historicalMessage.content,
    };

    // Some providers, like Ollama, expect the content to be embedded in the message object.
    if (mode === "spread") {
      return {
        // @ts-ignore
        role: historicalMessage.role,
        ...formatterFunction({
          userPrompt: historicalMessage.content,
          attachments: historicalMessage.attachments,
        }),
      };
    }

    // Most providers expect the content to be a property of the message object formatted like OpenAI models.
    return {
      role: historicalMessage.role,
      content: formatterFunction({
        userPrompt: historicalMessage.content,
        attachments: historicalMessage.attachments,
      }),
    };
  });
}