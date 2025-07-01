import { Platform } from "react-native";
import { getDeviceName } from "react-native-device-info";

type Commands = 'get-workspaces' | 'pull-workspace-content' | 'unregister-device';
export type CommandResponses = {
    'get-workspaces': { workspaces: Array<{ id: number; name: string, slug: string, threadCount: number, chatCount: number, documentCount: number, openAiPrompt: string, openAiTemp: number, topN: number }> };
    'pull-workspace-content': {
        workspace: { id: number; name: string, slug: string, openAiPrompt: string, openAiTemp: number, topN: number };
        threads: Array<{ id: number; name: string, slug: string, workspace_id: number }>;
        chats: Array<{ id: number; workspaceId: number, thread_id: number, prompt: string, response: string, createdAt: number }>;
        documents: Array<{ id: number; docId: string, workspaceId: number, metadata: { title: string }, pageContent: string }>;
    };
    'unregister-device': never;
};

type CommandBodies = {
    'get-workspaces': never;
    'pull-workspace-content': { workspaceId: number };
    'unregister-device': never;
};

class AnythingLLMExternal {
    private readonly connectionUrl: string;
    private readonly deviceToken: string;
    constructor(connectionUrl: string, deviceToken?: string) {
        if (!this.isValidUrl(connectionUrl)) throw new Error('Invalid URL');
        this.connectionUrl = connectionUrl;
        this.deviceToken = deviceToken ?? '';
    }

    private isValidUrl(url: string) {
        try {
            new URL(url);
            if (!url.startsWith('http') && !url.startsWith('https')) return false;
            if (url.endsWith('/') || !url.endsWith('/api/mobile')) return false;
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Register the device with the instance
     * @returns the token for the device
     */
    async registerDevice(): Promise<string | null> {
        const response = await fetch(`${this.connectionUrl}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                deviceName: await getDeviceName(),
                deviceOs: Platform.OS,
            }),
        });
        if (!response.ok) throw new Error('Failed to register device');
        const data = await response.json();
        return data?.token ?? null;
    }

    /**
     * Check if the device token is approved
     * @param deviceToken - The token to check
     * @returns True if the token is approved, false otherwise
     */
    async tokenIsApproved(deviceToken: string = this.deviceToken): Promise<boolean> {
        const response = await fetch(`${this.connectionUrl}/auth`, {
            headers: {
                'Content-Type': 'application/json',
                'x-anythingllm-mobile-device-token': deviceToken,
            },
        });
        if (!response.ok) return false;
        await response.text(); // consume the response so it is not left open
        return true;
    }

    async sendCommand<T extends Commands>(
        command: T,
        body?: CommandBodies[T]
    ): Promise<CommandResponses[T]> {
        const response = await fetch(`${this.connectionUrl}/send/${command}`, {
            method: 'POST',
            body: body ? JSON.stringify(body) : undefined,
            headers: {
                'Content-Type': 'application/json',
                'x-anythingllm-mobile-device-token': this.deviceToken,
            },
        });
        if (!response.ok) throw new Error('Failed to send command');
        return response.json();
    }
}

export default AnythingLLMExternal;