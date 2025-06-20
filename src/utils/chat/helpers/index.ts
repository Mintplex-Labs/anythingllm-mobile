import { DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";

/**
 * Formats the chat history to re-use attachments in the chat history
 * that might have existed in the conversation earlier.
 */
export function formatChatHistory(
  chatHistory: DynamicChatMessage[] = [],
  formatterFunction: any,
  mode: "asProperty" | "spread" = "asProperty"
) {
  return chatHistory.flatMap((historicalMessage) => {
    if (
      !historicalMessage?.response?.attachments || // If there are no attachments, we can skip this
      !historicalMessage.response.attachments.length // If there is an array but it is empty, we can skip this
    ) {
      return [{
        role: "user",
        content: historicalMessage.prompt,
      },
      {
        role: "assistant",
        content: historicalMessage.response?.textResponse || "",
      }];
    }

    // Some providers, like Ollama, expect the content to be embedded in the message object.
    if (mode === "spread") {
      return [
        {
          role: "user",
          content: historicalMessage.prompt,
        },
        {
          role: "assistant",
          ...formatterFunction({
            userPrompt: historicalMessage.prompt,
            attachments: historicalMessage.response.attachments,
          }),
        },
      ];
    }

    // Most providers expect the content to be a property of the message object formatted like OpenAI models.
    return [
      {
        role: "user",
        content: historicalMessage.prompt,
      },
      {
        role: "assistant",
        content: historicalMessage.response?.textResponse || "",
      },
    ];
  });
}