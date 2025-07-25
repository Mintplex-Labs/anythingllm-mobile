import { Platform } from "react-native";
import { getDeviceName } from "react-native-device-info";

export type Commands = 'workspaces' | 'workspace-content' | 'model-tag' | 'reset-chat' | 'new-thread' | 'unregister-device';
export type CommandResponses = {
    'workspaces': { workspaces: Array<{ id: number; name: string, slug: string, threadCount: number, chatCount: number, openAiPrompt: string, openAiTemp: number, topN: number, platform: 'server' | 'desktop' }> };
    'workspace-content': {
        workspace: { id: number; name: string, slug: string, openAiPrompt: string, openAiTemp: number, topN: number };
        threads: Array<{ id: number; name: string, slug: string, workspace_id: number }>;
        chats: Array<{ id: number; workspaceId: number, thread_id: number, prompt: string, response: string, createdAt: number }>;
    };
    'model-tag': { model: string };
    'reset-chat': never;
    'new-thread': { thread: { id: number; name: string, slug: string, workspace_id: number } };
    'unregister-device': never;
};

export type CommandBodies = {
    'workspaces': never;
    'workspace-content': { workspaceSlug: string };
    'model-tag': { workspaceSlug: string };
    'reset-chat': { workspaceSlug: string, threadSlug: string | null };
    'new-thread': { workspaceSlug: string };
    'unregister-device': never;
};

class AnythingLLMExternal {
    static HEADER_AUTH_TOKEN = 'x-anythingllm-mobile-device-token';
    /** The connection URL for the AnythingLLM instance */
    readonly connectionUrl: string;
    /** The device token for the AnythingLLM instance for this mobile device */
    readonly deviceToken: string;
    /** The temporary registration token for the AnythingLLM instance for this mobile device Only used for QR code registration */
    readonly regToken: string;

    constructor(connectionUrl: string, deviceToken?: string, regToken?: string) {
        if (!this.isValidUrl(connectionUrl)) throw new Error('Invalid URL');
        this.connectionUrl = connectionUrl;
        this.deviceToken = deviceToken ?? '';
        this.regToken = regToken ?? '';
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
     * Will pass through the registration token if it is set via an Authorization header.
     * AnythingLLM instances typically require a registration token to be passed in the Authorization header so we know
     * that the request is coming from an authorized user.
     */
    async registerDevice(): Promise<{ token: string, platform: 'server' | 'desktop', error?: string }> {
        const response = await fetch(`${this.connectionUrl}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(this.regToken ? { Authorization: `Bearer ${this.regToken}` } : {}),
            },
            body: JSON.stringify({
                deviceName: await getDeviceName(),
                deviceOs: Platform.OS,
            }),
        });

        let data: { token: string, platform: 'server' | 'desktop', error?: string } = { token: '', platform: 'server', error: 'Unknown error' };
        try { data = await response.json(); } catch { }

        if (!response.ok || !!data?.error) {
            console.error(`[${response.status}] Failed to register device: ${response.statusText}`, data);
            throw new Error(`Failed to register device: ${data?.error ?? response.statusText}`);
        }

        return data;
    }

    /**
     * Check if the device token is approved
     * @param deviceToken - The token to check
     * @returns True if the token is approved, false otherwise
     */
    async tokenIsApproved(deviceToken: string = this.deviceToken): Promise<boolean> {
        if (!deviceToken) return false;
        const aborter = new AbortController();
        setTimeout(() => aborter.abort(), 2_000); // 2 seconds timeout until the request is aborted
        const response = await fetch(`${this.connectionUrl}/auth`, {
            headers: {
                'Content-Type': 'application/json',
                [AnythingLLMExternal.HEADER_AUTH_TOKEN]: deviceToken,
            },
            signal: aborter.signal,
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
                [AnythingLLMExternal.HEADER_AUTH_TOKEN]: this.deviceToken,
            },
        });
        if (!response.ok) throw new Error('Failed to send command');
        return response.json();
    }
}

export default AnythingLLMExternal;