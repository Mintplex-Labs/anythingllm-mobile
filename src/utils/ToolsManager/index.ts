import uiStore from "@/store/UIStore";
import { NativeCompletionResult } from "cactus-react-native";
import { generateUUID } from "../constants";
import { ICompleteResponse, IStreamCallback, IStreamEvent } from "../AiProviders/baseOpenAILikeProvider";
import Tools from './tools';
import { safeJsonParse } from "../formatters";
import Telemetry from "../Telemetry";

type ToolManagerTool = {
    /** Definition of the tool - this can be used to generate a tool call */
    id: string;
    name: string;
    description: string;
    defaultEnabled: boolean;
    category: 'default' | 'appConnections';
    definition: {
        type: 'function';
        function: {
            name: string;
            description?: string;
            parameters: {
                type: 'object',
                properties: {
                    [key: string]: any;
                },
                required: readonly string[];
            };
        }
    }
    /** Configuration of the tool - this is used to store the tool's configuration for use during execution */
    config: { [key: string]: any };

    /** Execute the tool with given arguments - should return a string */
    execute: (args: any, streamEmitter: (event: IStreamEvent, data: any) => void) => Promise<string> | string;
}

type ToolCallLoopProps = {
    currentResponse: ICompleteResponse;
    runStreamCompletion: (messages: any[], callback: IStreamCallback, availableTools: any[]) => Promise<ICompleteResponse>;
    streamEmitter: (event: IStreamEvent, data: any) => void;
    currentMessageHistory: any[];
    /** Whether to merge the tool call results into the previous message (this is the default behavior) */
    mergeToolCallResults?: boolean;
}

class ToolsManager {
    static instance: ToolsManager;
    private _tools: ToolManagerTool[] | null = null;

    configurableTools = [
        Tools.default.webSearch,
        Tools.default.webScraping,
        Tools.default.getCurrentTime,
        Tools.default.getLocation,
        Tools.default.summarize,
        Tools.appConnections.draftEmail,
        Tools.appConnections.draftText,
        Tools.appConnections.calendarEventCreation,
        Tools.appConnections.calendarEventReading,
    ]

    log = (text: string, ...args: any[]) => {
        console.log(`\x1b[35m[ToolsManager] ${text}\x1b[0m`, ...args);
    }

    constructor() {
        if (ToolsManager.instance) return ToolsManager.instance;
        ToolsManager.instance = this;
    }

    resetTools() {
        this._tools = null;
    }

    /**
     * Gets all of the tools that are enabled by the user or the default tools
     * in the raw format that the ToolsManager uses - should not be used directly for LLM function calling
     */
    async getTools(): Promise<ToolManagerTool[]> {
        const userSettings = await uiStore.getFromStorage('tools', {});
        let enabledTools: ToolManagerTool[] = [];
        for (const tool of this.configurableTools) {
            // If the tool is not a key in the user settings, and it is default enabled, add it to the enabled tools
            if (!userSettings.hasOwnProperty(tool.id) && tool.defaultEnabled) {
                enabledTools.push(tool);
                continue;
            }

            if (userSettings[tool.id]) enabledTools.push(tool);
        }
        return enabledTools;
    }

    /**
     * Gets all of the tools that are enabled by the user or the default tools
     * in the format that any supported LLM can use for function calling
     */
    async injectAvailableTools(): Promise<ToolManagerTool['definition'][]> {
        try {
            // If the tools are not loaded, load them. Null is used to indicate that the tools are not loaded.
            if (this._tools === null) this._tools = await this.getTools();
            return this._tools.map(tool => tool.definition);
        } catch (error) {
            this.log('ToolsManager::injectAvailableTools: Error getting available tools', error);
            return [];
        }
    }

    private _generateToolCallSignature(toolCall: NativeCompletionResult['tool_calls'][number]) {
        const { name, arguments: args } = toolCall.function;
        if (!name) return '';
        if (Object.keys(args).length > 0 && args !== "{}") {
            const parsedArgs = safeJsonParse(args, null);
            if (!parsedArgs) return `${name}(${JSON.stringify(args)})`;
            const argsString = Object.entries(parsedArgs).map(([key, value]) => `${key}: ${value}`).join(', ');
            return `${name}(${argsString})`;
        }
        else return `${name}()`;
    }

    /**
     * Manages the execution of tool calls and returns the next messages to be sent to the LLM
     */
    async manageToolCallExecutions(
        toolCalls: NativeCompletionResult['tool_calls'],
        streamEmitter: (event: IStreamEvent, data: any) => void,
        currentMessageHistory: any[],
    ): Promise<any[]> {
        const nextMessages = [...currentMessageHistory];

        if (!toolCalls || toolCalls.length === 0) return nextMessages;
        streamEmitter('will_call_tools', '');
        for (const toolCall of toolCalls) {
            const toolCallName = this._generateToolCallSignature(toolCall);
            const humanReadableToolCall = {
                uuid: generateUUID(),
                signature: toolCallName,
                result: '',
            }
            streamEmitter('report_tool_call', humanReadableToolCall);

            const knownToolConfig = this._tools?.find(tool => tool.definition.function.name === toolCall.function.name);
            if (!knownToolConfig) {
                this.log(`ToolsManager::manageToolCallExecutions: Tool not found or available: ${toolCallName}`);
                streamEmitter('report_tool_call_result', {
                    uuid: humanReadableToolCall.uuid,
                    signature: humanReadableToolCall.signature,
                    result: 'Error: Tool not found or available',
                });
                continue;
            }

            this.log(`ToolsManager::manageToolCallExecutions: Executing tool call: ${toolCallName}`);
            const toolCallResult = await knownToolConfig.execute(toolCall.function.arguments, streamEmitter);
            streamEmitter('report_tool_call_result', {
                uuid: humanReadableToolCall.uuid,
                signature: humanReadableToolCall.signature,
                result: toolCallResult ?? 'Error: No result from tool call',
            });
            nextMessages.push({
                role: 'tool',
                content: toolCallResult,
                signature: humanReadableToolCall.signature,
                function: toolCall.function.name,
            });
            Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.TOOL_CALLED, { tool: toolCall.function.name });
        }
        return nextMessages;
    }

    /**
     * This is the main loop that manages the tool calls.
     * It will loop until there are no more tool calls to make.
     * It will also manage the tool call responses and update the message history.
     * 
     * If the current response has no tool calls, it will return the current response as is without looping.
     * If tool calls are present, it will loop until there are no more tool calls to make.
     * - Each loop will append the tool call responses to the previous message since most times, if a role: function exists in the history, it will refuse to call any more tool calls, even if they are different
     * - The loop will continue until there are no more tool calls to make - determined by the toolCalls property of the response
     * - Each loop will remove any already called tool from the available tools to prevent infinite loops of tools (TBD on if we keep this eg: deep-research)
     * - The loop will return the final response from the LLM.
     */
    async toolCallLoop({
        currentResponse,
        runStreamCompletion,
        streamEmitter,
        currentMessageHistory,
        mergeToolCallResults = true,
    }: ToolCallLoopProps): Promise<ICompleteResponse> {
        let willLoop = currentResponse.toolCalls && currentResponse.toolCalls.length > 0;
        if (!willLoop) return currentResponse;

        let availableTools = await this.injectAvailableTools();
        let nextResponse = currentResponse;
        let nextMessages = [...currentMessageHistory];

        do {
            nextMessages = await this.manageToolCallExecutions(nextResponse.toolCalls ?? [], streamEmitter, nextMessages);
            for (const [index, message] of nextMessages.entries()) {
                if (message.role === 'tool' && mergeToolCallResults) {
                    const previousMessage = nextMessages[index - 1];
                    nextMessages[index - 1] = { ...previousMessage, content: `${previousMessage.content}\nFunction: ${message.signature}\nResult: ${message.content}` };
                    availableTools = availableTools.filter(tool => tool.function.name !== message.function); // Remove the tool from the available tools
                    nextMessages.pop(); // Remove the tool message
                }
            }

            nextResponse = await runStreamCompletion(nextMessages, (token: string) => streamEmitter('chunk', token), availableTools);
            willLoop = nextResponse.toolCalls && nextResponse.toolCalls.length > 0;
        } while (willLoop);
        return nextResponse;
    }
}

export default new ToolsManager();