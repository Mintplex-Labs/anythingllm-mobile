import { WorkspaceType } from "@/database/models/Workspace";
import { DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";
import { formatChatHistory } from "@/utils/chat/helpers";
import { StreamMetrics } from "@/utils/chat/LLMPerformanceMonitor";
import { MonitoredStream } from "@/utils/chat/LLMPerformanceMonitor";
import LLMPerformanceMonitor from "@/utils/chat/LLMPerformanceMonitor";
import OpenAILite from "@/utils/openai";

interface BaseLLMProviderConfig {
  provider: string;
  config: { [key: string]: any };
}

export type ICompleteResponse = {
  textResponse: string;
  metrics: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    outputTps: number;
    duration: number;
  },
}

export type IStreamableResponse = {
  stream: any;
  abortController: AbortController;
}

type IContent = {
  type: string;
  text?: string;
  image_url?: {
    url: string;
    detail: string;
  };
}

export type IStreamEvent = 'chunk' | 'complete' | 'abort';
export type IStreamCallback = (event: IStreamEvent, response: string | ICompleteResponse['metrics']) => void;
export type IAttachment = {
  contentString: string;
}

export default abstract class BaseOpenAILikeProvider {
  protected _provider: string;
  protected _config: any;
  private _workspace: WorkspaceType | null = null;
  protected abstract client: OpenAILite;
  protected abstract isOTypeModel: boolean;
  protected abstract model: string;
  protected abstract temperature: number;
  protected abstract log: (message: string, ...args: any[]) => void;
  abstract availableModels(): object[];

  static DEFAULT_SYSTEM_MESSAGE = 'You are a helpful assistant that can answer questions and help with tasks.';

  constructor({ provider, config }: BaseLLMProviderConfig) {
    this._provider = provider;
    this._config = config;
  }

  /**
   * Returns the name of the provider.
   */
  get name() {
    return this._provider;
  }

  get workspace() {
    if (!this._workspace) this.log('\x1b[43m\x1b[34m[ERROR]\x1b[0m No workspace attached to provider - you likely forgot to call attachWorkspaceToProvider(workspace) before using this method in any call stack.');
    return this._workspace || null;
  }

  /**
   * Attaches a workspace to the provider so it can be referenced
   * when generating a system message.
   */
  attachWorkspaceToProvider(workspace: WorkspaceType) {
    this.log(`Attached workspace "${workspace.slug}" to LLM provider!`);
    this._workspace = workspace;
  }

  /**
   * Generates the system message for the provider.
   * If the workspace has a system prompt, it will be used.
   * Otherwise, the default system message will be used.
   */
  defaultSystemMessage(contextTexts: string[] = []) {
    const baseMessage = this.workspace?.systemPrompt || BaseOpenAILikeProvider.DEFAULT_SYSTEM_MESSAGE;
    if (!contextTexts.length) return baseMessage;
    return `${baseMessage}\n\nHere is some context that may be relevant to the conversation: ${contextTexts.join('\n\n')}`;
  }

  /**
   * Generates appropriate content array for a message + attachments.
  */
  private generateContent({ content, attachments = [] }: { content: string, attachments: IAttachment[] }) {
    if (!attachments.length) return content;

    const msgContent: IContent[] = [{ type: "text", text: content }];
    for (let attachment of attachments) {
      msgContent.push({
        type: "image_url",
        image_url: {
          url: attachment.contentString,
          detail: "high",
        },
      });
    }
    return msgContent;
  }

  /**
  * Construct the user prompt for this model.
  */
  private constructMessages({
    contextTexts = [],
    chatHistory = [],
    userPrompt = "",
    attachments = [],
  }: {
    contextTexts: string[];
    chatHistory: DynamicChatMessage[];
    userPrompt: string;
    attachments?: IAttachment[];
  }) {
    // o1 Models do not support the "system" role
    // in order to combat this, we can use the "user" role as a replacement for now
    // https://community.openai.com/t/o1-models-do-not-support-system-role-in-chat-completion/953880
    const prompt = {
      role: this.isOTypeModel ? "user" : "system",
      content: this.defaultSystemMessage(contextTexts),
    };

    return [
      prompt,
      ...formatChatHistory(chatHistory, this.generateContent),
      {
        role: "user",
        content: this.generateContent({ content: userPrompt, attachments }),
      },
    ];
  }

  /**
   * Builds the prompt from the message history.
   */
  buildPrompt(messages: DynamicChatMessage[]) {
    if (messages.length === 0) throw new Error("Messages array must contain at least one element");
    const history = messages.slice(0, -1);
    const userPrompt = messages[messages.length - 1];

    // TODO: Semantic search for context text
    const contextTexts: string[] = [];

    return this.constructMessages({
      chatHistory: history,
      userPrompt: userPrompt.prompt as string,
      contextTexts,
    });
  }

  async chat({
    messages,
    streaming = false,
    onComplete = () => { },
    onStream = () => { },
  }: {
    messages: DynamicChatMessage[];
    streaming?: boolean;
    onComplete?: (response: ICompleteResponse) => void;
    onStream?: IStreamCallback;
  }) {
    const formattedMessages = this.buildPrompt(messages);
    // For async responses, we can just return the response immediately
    if (!streaming) {
      const response = await this.getChatCompletion(formattedMessages);
      onComplete({
        textResponse: response.textResponse,
        metrics: response.metrics,
      });
      return;
    }

    const { stream, abortController } = await this.streamGetChatCompletion(formattedMessages);
    await this.handleDefaultStreamResponse(stream, onStream, abortController);
  }

  /**
   * Gets the chat completion from the model.
   * Returns the text response and metrics in a single call, no streaming.
   */
  private async getChatCompletion(messages: any[] = []): Promise<ICompleteResponse> {
    this.log('Running chat completion...');
    const result = await LLMPerformanceMonitor.measureAsyncFunction(
      // @ts-ignore
      this.client.chat.completions
        .create({
          model: this.model,
          messages,
          temperature: this.isOTypeModel ? 1 : this.temperature,
        })
    ) as unknown as { duration: number, output: Partial<any> & MonitoredStream & { usage: StreamMetrics } };

    const choices = result.output?.choices;
    if (!choices || choices.length === 0 || !choices[0].message.content) throw new Error('No response from LLM');

    return {
      textResponse: choices[0].message.content,
      metrics: {
        prompt_tokens: result.output.usage?.prompt_tokens || 0,
        completion_tokens: result.output.usage?.completion_tokens || 0,
        total_tokens: result.output.usage?.total_tokens || 0,
        outputTps: result.output.usage?.completion_tokens / result.duration,
        duration: result.duration,
      },
    };
  }

  async streamGetChatCompletion(messages: any[] = []): Promise<IStreamableResponse> {
    const abortController = new AbortController();
    const stream = await LLMPerformanceMonitor.measureStream(
      // @ts-ignore
      this.client.chat.completions.create({
        model: this.model,
        stream: true,
        messages,
        temperature: this.isOTypeModel ? 1 : this.temperature,
      }, { controller: abortController }),
      messages,
    );
    return { stream, abortController };
  }

  private async handleDefaultStreamResponse(stream: any, handler: IStreamCallback, abortController: AbortController) {
    let hasUsageMetrics = false;
    let usage = {
      prompt_tokens: 0,
      completion_tokens: 0,
    };

    return new Promise(async (resolve) => {
      let fullText = "";

      const handleAbort = () => {
        stream?.endMeasurement(usage);
        console.log("\x1b[43m\x1b[34m[STREAM ABORTED]\x1b[0m Client requested to abort stream. Exiting LLM stream handler early.");
        resolve(fullText);
      };
      abortController.signal.addEventListener('abort', handleAbort);

      try {
        for await (const chunk of stream) {
          const content = chunk?.choices?.[0]?.delta?.content;
          const finishReason = chunk?.choices?.[0]?.finish_reason;

          // Handle usage metrics if present
          if (chunk?.usage) {
            if (chunk.usage.prompt_tokens) {
              usage.prompt_tokens = Number(chunk.usage.prompt_tokens);
            }
            if (chunk.usage.completion_tokens) {
              hasUsageMetrics = true;
              usage.completion_tokens = Number(chunk.usage.completion_tokens);
            }
          }

          // Handle content if present
          if (content) {
            fullText += content;
            if (!hasUsageMetrics) usage.completion_tokens++;
            handler('chunk', content);
          }

          // Check for completion
          if (finishReason) {
            handler('complete', {
              prompt_tokens: usage.prompt_tokens,
              completion_tokens: usage.completion_tokens,
              total_tokens: usage.prompt_tokens + usage.completion_tokens,
              outputTps: usage.completion_tokens / stream.duration,
              duration: stream.duration,
            });
            stream?.endMeasurement(usage);
            resolve(fullText);
            break;
          }
        }
      } catch (e: any) {
        console.log(`\x1b[43m\x1b[34m[STREAMING ERROR]\x1b[0m ${e.message}`);
        handler('abort', e.message);
        stream?.endMeasurement(usage);
        resolve(fullText);
      }
    });
  }
}
