import Workspace, { type WorkspaceType } from "@/database/models/Workspace";
import { IAgentCitation, IAgentToolCall, IDocumentCitation } from "@/database/models/WorkspaceChat";
import { DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";
import { formatChatHistory } from "@/utils/chat/helpers";
import { StreamMetrics } from "@/utils/chat/LLMPerformanceMonitor";
import { MonitoredStream } from "@/utils/chat/LLMPerformanceMonitor";
import LLMPerformanceMonitor from "@/utils/chat/LLMPerformanceMonitor";
import getEmbedder from "@/utils/Embedder";
import OpenAILite from "@/utils/openai";
import VectorDB, { SemanticSearchResult } from "@/utils/VectorDB";
import { type IAgentAction } from "@/database/models/WorkspaceChat";
import ToolsManager from "@/utils/ToolsManager";

interface BaseLLMProviderConfig {
  provider: string;
  config: { [key: string]: any };
}

export type ICompleteResponse = {
  textResponse: string;
  toolCalls?: {
    type: 'function'
    function: {
      name: string
      arguments: string
    }
    id?: string
  }[];
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

export type IStreamEvent = 'chunk' |
  'complete' |
  'abort' | // will throw and crash the app!
  'timed_out' |
  'report_citations' |
  'report_metrics' |
  'will_call_tools' |
  'report_tool_call' |
  'report_tool_call_result' |
  'report_action' |
  'report_in_progress_thought';
export type IStreamResponse = string | ICompleteResponse['metrics'] | IDocumentCitation[] | IAgentCitation[] | IAgentToolCall | IAgentAction;
export type IStreamCallback = (
  event: IStreamEvent,
  response: IStreamResponse
) => void;

export type IAttachment = {
  contentString: string;
}

export type IAvailableModel = {
  id: string;
  object: string;
  owned_by: string;
}

class SilentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SilentError';
  }
}

export default abstract class BaseOpenAILikeProvider {
  protected _provider: string;
  protected _config: any;
  private _workspace: WorkspaceType | null = null;
  private streamingTimeoutLimit: number = 10_000; // Wait 10 seconds before assuming the request is timed out
  protected abstract client: OpenAILite;
  protected abstract isOTypeModel: boolean;
  protected abstract model: string;
  protected abstract temperature: number;
  protected abstract log: (message: string, ...args: any[]) => void;
  protected abstract loadNewModel(model: string): Promise<void>;
  protected abstract unloadModel(): Promise<void>;
  public isExternalProvider: boolean = false;
  abstract availableModels(): Promise<IAvailableModel[]>;

  static DEFAULT_SYSTEM_MESSAGE = 'You are a helpful assistant that can answer questions and help with tasks.';

  private DEFAULT_TOP_N = 2;
  private SEMANTIC_SEARCH_MIN_RELEVANCE_SCORE = 0.45;

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

  get topN() {
    return this.DEFAULT_TOP_N;
    // return this.workspace.topN;
  }

  get minRelevanceScore() {
    return this.SEMANTIC_SEARCH_MIN_RELEVANCE_SCORE;
    // return this.workspace.minRelevanceScore;
  }

  /**
   * Attaches a workspace to the provider so it can be referenced
   * when generating a system message.
   */
  attachWorkspaceToProvider(workspace: WorkspaceType) {
    if (!workspace) return;

    const existingWorkspace = this._workspace ? Workspace.toWorkspaceObject(this._workspace) : null;
    const newWorkspace = Workspace.toWorkspaceObject(workspace);

    // If the workspace is the same as the existing workspace, do nothing
    if (existingWorkspace && JSON.stringify(existingWorkspace) === JSON.stringify(newWorkspace)) return;

    this.log(`Attached workspace "${workspace.slug}" to LLM provider!`);
    this._workspace = workspace;
    this.unloadModelOnWorkspaceChange(existingWorkspace, newWorkspace);
  }

  private unloadModelOnWorkspaceChange(previousWorkspace: WorkspaceType | null, newWorkspace: WorkspaceType) {
    const trackableChanges = {
      contextLength: previousWorkspace?.contextLength !== newWorkspace.contextLength,
      temperature: previousWorkspace?.temperature !== newWorkspace.temperature,
    }

    for (const [key, value] of Object.entries(trackableChanges)) {
      if (!value) continue;
      this.log(`Workspace "${newWorkspace.slug}" changed ${key} - unloading model`);
      this.unloadModel();
      break; // break out of the loop after the first change true
    }

    return;
  }

  /**
   * Generates the system message for the provider.
   * If the workspace has a system prompt, it will be used.
   * Otherwise, the default system message will be used.
   * 
   * Will also add the context texts to the system message if they are provided.
   */
  defaultSystemMessage(contextTexts: string[] = []) {
    const baseMessage = this.workspace?.systemPrompt || BaseOpenAILikeProvider.DEFAULT_SYSTEM_MESSAGE;
    if (!contextTexts.length) return baseMessage;

    const context = contextTexts
      .map((text, i) => {
        return `Context ${i + 1}: ${text}`;
      })
      .join("\n\n");

    return `${baseMessage}\n\n[CONTEXT_START]\n${context}\n[CONTEXT_END]`;
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

  private buildDocumentCitations(vectorSearchResults: SemanticSearchResult[]): IDocumentCitation[] {
    return vectorSearchResults.map((r) => ({
      type: 'document',
      document: {
        uuid: String(r.id),
        name: String(r.metadata.name),
        chunk: String(r.metadata.content),
        score: r.score, // numberToPercentageString(r.score) will be run on the frontend to convert to a percentage string
      },
    }));
  }

  /**
   * Filters the semantic search results to only include relevant results.
   * 
   * @param results - The semantic search results to filter.
   * @returns The filtered semantic search results.
   */
  private filterSemanticSearchResults(results: SemanticSearchResult[]): SemanticSearchResult[] {
    return results
      .map((r) => {
        const percentRelevance = 1 - r.score;
        const isRelevant = percentRelevance >= this.minRelevanceScore;
        if (isRelevant) return { ...r, score: percentRelevance };
        this.log(`Semantic search result "${r.metadata.name}" is not relevant enough (${percentRelevance})`);
        return null;
      })
      .filter((r) => r !== null);
  }

  /**
   * Gets the context texts for the user prompt from semantic search
   * of the workspace's vector store.
   */
  async getContextTexts(userPrompt: string): Promise<SemanticSearchResult[]> {
    try {
      if (!this.workspace) throw new SilentError('No workspace attached to provider');
      if (userPrompt.length < 10) throw new SilentError('User prompt is too short to get context texts');
      if (await VectorDB.getWorkspaceVectorCount(this.workspace.slug) === 0) throw new SilentError('No vectors in vector store');

      const embedder = getEmbedder('native');
      const queryVector = await embedder.embed(userPrompt, 'query');
      const results = await VectorDB
        .runSemanticSearch(this.workspace.slug, queryVector, this.topN)
        .then((results) => this.filterSemanticSearchResults(results));

      if (results.length === 0) return [];
      this.log(`\nGot ${results.length} contexts:`, JSON.stringify({ topN: this.topN, minRelevanceScore: this.minRelevanceScore, dimensions: queryVector.length, query: `${userPrompt.slice(0, 50)}...`, results: results.map((r) => r.score) }, null, 2));
      return results;
    } catch (e) {
      if (e instanceof Error) this.log(e.message);
      else this.log('Error getting context texts:', e);
      return [];
    }
  }

  /**
   * Builds the prompt from the message history.
   */
  async buildPrompt(messages: DynamicChatMessage[]): Promise<{ citations: IDocumentCitation[], formattedMessages: any[] }> {
    if (messages.length === 0) throw new Error("Messages array must contain at least one element");
    const history = messages.slice(0, -1);
    const userPrompt = messages[messages.length - 1];
    const vectorSearchResults = await this.getContextTexts(userPrompt.prompt as string);
    const contextTexts = vectorSearchResults
      .filter((r) => r.metadata.content !== undefined && r.metadata.content !== null && r.metadata.content !== '')
      .map((r) => String(r.metadata.content));

    return {
      citations: this.buildDocumentCitations(vectorSearchResults),
      formattedMessages: this.constructMessages({
        chatHistory: history,
        userPrompt: userPrompt.prompt as string,
        contextTexts,
      }),
    }
  }

  /**
   * Runs a basic chat completion with already formatted messages {role: 'system', content: '...'}
   * This is a wrapper around the getChatCompletion method that returns the text response and metrics.
   * 
   * @param messages - The messages to send to the model.
   * @returns The text response and metrics.
   */
  async runBasicChatCompletion(messages: any[]): Promise<ICompleteResponse> {
    return this.getChatCompletion(messages);
  }

  async chat({
    messages,
    streaming = false,
    onComplete = (response: ICompleteResponse) => { console.log('Debug: onComplete - if you are seeing this you forgot to handle completion responses but got one.', response) },
    onStream = (event: IStreamEvent, data: any) => { console.log('Debug: onStream - if you are seeing this you forgot to handle stream responses but got one.', event, data) },
  }: {
    messages: DynamicChatMessage[];
    streaming?: boolean;
    /** On complete is for non-streaming responses - it will not be called if streaming is true */
    onComplete?: (response: ICompleteResponse) => void;
    /** On stream is for streaming responses - will fire for each token */
    onStream?: IStreamCallback;
  }) {
    const { formattedMessages, citations } = await this.buildPrompt(messages);
    if (!streaming) {
      const response = await this.getChatCompletion(formattedMessages);
      onComplete({
        textResponse: response.textResponse,
        metrics: response.metrics,
      });
      return;
    }

    const availableTools = await ToolsManager.injectAvailableTools();
    this.log(`Streaming ${this.model} with ${availableTools.length} available tools`);
    const { stream, abortController } = await this.streamGetChatCompletion(formattedMessages, availableTools);
    const fullResult = await this.handleDefaultStreamResponse(stream, onStream, abortController);

    await ToolsManager.toolCallLoop({
      currentResponse: fullResult,
      runStreamCompletion: async (messages: any[], _callback: IStreamCallback, availableTools: any[]) => {
        const { stream, abortController } = await this.streamGetChatCompletion(messages, availableTools);
        return await this.handleDefaultStreamResponse(stream, (event: IStreamEvent, data: any) => onStream(event, data), abortController);
      },
      streamEmitter: (event: IStreamEvent, data: any) => onStream(event, data),
      currentMessageHistory: formattedMessages,
      mergeToolCallResults: false,
    });

    if (!!fullResult.metrics) onStream('report_metrics', fullResult.metrics);
    if (!!citations) onStream('report_citations', citations);
    onStream('complete', '');
  }

  /**
   * Gets the chat completion from the model.
   * Returns the text response and metrics in a single call, no streaming.
   */
  private async getChatCompletion(messages: any[] = [], availableTools: any[] = []): Promise<ICompleteResponse> {
    this.log('Running chat completion...');
    const result = await LLMPerformanceMonitor.measureAsyncFunction(
      // @ts-ignore
      this.client.chat.completions
        .create({
          model: this.model,
          messages,
          temperature: this.isOTypeModel ? 1 : this.temperature,
          tools: availableTools,
        })
    ) as unknown as { duration: number, output: Partial<any> & MonitoredStream & { usage: StreamMetrics } };

    const choices = result.output?.choices;
    if (!choices || choices.length === 0 || !choices[0].message.content) throw new Error('No response from LLM');

    return {
      textResponse: choices[0].message.content,
      toolCalls: choices?.[0]?.message?.tool_calls || [],
      metrics: {
        prompt_tokens: result.output.usage?.prompt_tokens || 0,
        completion_tokens: result.output.usage?.completion_tokens || 0,
        total_tokens: result.output.usage?.total_tokens || 0,
        outputTps: result.output.usage?.completion_tokens / result.duration,
        duration: result.duration,
      },
    };
  }

  async streamGetChatCompletion(messages: any[] = [], availableTools: any[] = []): Promise<IStreamableResponse> {
    const abortController = new AbortController();
    const stream = await LLMPerformanceMonitor.measureStream(
      // @ts-ignore
      this.client.chat.completions.create({
        model: this.model,
        stream: true,
        messages,
        temperature: this.isOTypeModel ? 1 : this.temperature,
        ...(availableTools.length > 0 ? { tools: availableTools, tool_choice: 'auto' } : {}),
      }, { controller: abortController }),
      messages,
    );

    return { stream, abortController };
  }

  private async handleDefaultStreamResponse(stream: any, handler: IStreamCallback, abortController: AbortController): Promise<ICompleteResponse> {
    let hasUsageMetrics = false;
    let usage = {
      prompt_tokens: 0,
      completion_tokens: 0,
    };
    let toolToCall: { type: 'function', function: { name: string, arguments: string } } | null = null;
    let timeout: NodeJS.Timeout | null = null;

    return new Promise(async (resolve) => {
      let fullText = "";

      const handleAbort = () => {
        stream?.endMeasurement(usage);
        if (timeout) clearTimeout(timeout);
        console.log("\x1b[43m\x1b[34m[STREAM ABORTED]\x1b[0m Client requested to abort stream. Exiting LLM stream handler early.");
        resolve({
          textResponse: fullText,
          toolCalls: toolToCall ? [toolToCall] : [],
          metrics: {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.prompt_tokens + usage.completion_tokens,
            outputTps: usage.completion_tokens / stream.duration,
            duration: stream.duration,
            ...stream.metrics,
          },
        });
      };
      abortController.signal.addEventListener('abort', handleAbort);

      try {
        // If we do not see a token in the timeout limit, abort the stream with a timed out error
        timeout = setTimeout(() => {
          abortController.abort();
          handler('timed_out', 'Streaming request did not receive a response in a reasonable amount of time. Connection may be lost.');
          resolve({
            textResponse: 'The request timed out before a response was received. Connection may be lost.',
            toolCalls: [],
            metrics: {
              prompt_tokens: 0,
              completion_tokens: 0,
              total_tokens: 0,
              outputTps: 0,
              duration: stream.duration,
            },
          });
          return;
        }, this.streamingTimeoutLimit);

        for await (const chunk of stream) {
          if (timeout) clearTimeout(timeout); // on the first chunk, clear the timeout since we know the service is responding
          const content = chunk?.choices?.[0]?.delta?.content;
          const toolCall = chunk?.choices?.[0]?.delta?.tool_calls?.[0];
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

          // Handle tool calls if present
          if (toolCall) {
            // If we don't have a tool to call yet, create one to track the tool call
            if (toolToCall === null) {
              toolToCall = {
                type: 'function',
                function: {
                  name: toolCall.function.name,
                  arguments: toolCall.function.arguments,
                }
              }
            } else {
              // If we already have a tool to call, append the arguments to the existing tool call
              toolToCall.function.arguments += toolCall.function.arguments;
            }
          }

          // Check for completion
          if (finishReason) {
            stream?.endMeasurement(usage);
            resolve({
              textResponse: fullText,
              toolCalls: toolToCall ? [toolToCall] : [],
              metrics: {
                prompt_tokens: usage.prompt_tokens,
                completion_tokens: usage.completion_tokens,
                total_tokens: usage.prompt_tokens + usage.completion_tokens,
                outputTps: usage.completion_tokens / stream.duration,
                duration: stream.duration,
                ...stream.metrics,
              },
            });
            break;
          }
        }
      } catch (e: any) {
        console.log(`\x1b[43m\x1b[34m[STREAMING ERROR]\x1b[0m ${e.message}`);
        handler('abort', e.message);
        stream?.endMeasurement(usage);
        resolve({
          textResponse: fullText,
          metrics: {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.prompt_tokens + usage.completion_tokens,
            outputTps: usage.completion_tokens / stream.duration,
            duration: stream.duration,
            ...stream.metrics,
          },
        });
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    });
  }
}
