import { IStreamCallback } from "../baseOpenAILikeProvider";
import { IOnDeviceStreamCallback } from "../onDevice";
import EventSource from "react-native-sse";
import { safeJsonParse } from "@/utils/formatters";
import AnythingLLMExternal, { CommandBodies, CommandResponses, Commands } from "@/utils/AnythingLLMExternal";

type DelegatedProviderConfig = {
    connectionUrl: string;
    deviceToken: string;
    workspaceSlug: string;
    threadSlug?: string | null;
    message: string;
}

/**
 * Specialized provider that delegates the chat to a remote AnythingLLM server/client to handle the chat.
 * This is specifically for device-to-device communication so the user on mobile can relay the chat to the server and so forth.
 */
class DelegatedProvider {
    /**
     * Validate the configuration for the delegated provider.
     * This will test the connection to the AnythingLLM server and validate the credentials.
     * Since the connection is likely local LAN, we check each time.
     */
    static async validateConfig(config: DelegatedProviderConfig) {
        const { connectionUrl, deviceToken, workspaceSlug, message } = config;
        let errors: string[] = [];
        if (!deviceToken) errors.push('No device token provided');
        if (!workspaceSlug) errors.push('workspaceSlug is required');
        if (!message) errors.push('message is required');
        if (!connectionUrl) errors.push('connectionUrl is required');

        try {
            const module = new AnythingLLMExternal(connectionUrl, deviceToken);
            const validateConnection = await module.tokenIsApproved();
            if (!validateConnection) errors.push('Failed to connect to the AnythingLLM server with URL and credential information');
        } catch (error) {
            errors.push(error instanceof Error ? error.message : 'Test connection failed');
        }

        if (errors.length > 0) console.error(errors.join(', '));
        return errors.length === 0;
    }

    /**
    * Handles the remote chat configuration by sending the message to an AnythingLLM server running on LAN
    * This will come back as an SSE stream of events
    */
    static async delegateStreamableChat({
        connectionUrl,
        deviceToken,
        workspaceSlug,
        threadSlug = null,
        message,
        onStream,
    }: {
        connectionUrl: string;
        deviceToken: string;
        workspaceSlug: string;
        threadSlug?: string | null;
        message: string;
        onStream: IStreamCallback | IOnDeviceStreamCallback;
    }): Promise<void> {
        return new Promise((resolve, reject) => {
            const es = new EventSource(`${connectionUrl}/send/stream-chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    [AnythingLLMExternal.HEADER_AUTH_TOKEN]: deviceToken,
                },
                body: JSON.stringify({
                    workspaceSlug,
                    threadSlug,
                    message,
                }),
            });

            es.addEventListener("open", () => {
                console.log("Opened SSE connection to AnythingLLM");
            });

            es.addEventListener("message", (event) => {
                const data = safeJsonParse(event.data || '{}');

                console.log('handleRemoteChat::type', data.type);
                switch (data.type) {
                    case 'textResponseChunk':
                        onStream('chunk', data.textResponse);
                        break;
                    case 'agentThought':
                        onStream('report_in_progress_thought', data.thought);
                        break;
                    case 'textResponse':
                        onStream('chunk', data.textResponse);
                        break;
                    case 'finalizeResponseStream':
                        onStream('complete', '');
                        es.close();
                        resolve();
                        break;
                    case 'error':
                        onStream('chunk', 'Error: ' + data.error);
                        onStream('abort', data.error);
                        es.close();
                        reject(new Error(data.error));
                        break;
                    default:
                        console.log("Unhandled message type:", data.type);
                        break;
                }
            });

            es.addEventListener("error", (event) => {
                if (event.type === "error") onStream('chunk', 'Error: ' + event.message);
                else if (event.type === "exception") onStream('chunk', 'Error: ' + event.message);
                es.close();
            });

            es.addEventListener("close", () => {
                console.log("Closed SSE connection to AnythingLLM");
                es.removeAllEventListeners();
                resolve();
            });
        });
    }

    static async sendCommand(config: { connectionUrl: string, deviceToken: string }, command: Commands, body: CommandBodies[Commands]): Promise<CommandResponses[Commands]> {
        const { connectionUrl, deviceToken } = config;
        const module = new AnythingLLMExternal(connectionUrl, deviceToken);
        return module.sendCommand(command, body);
    }
}

export default DelegatedProvider;