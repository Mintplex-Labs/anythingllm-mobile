import { Platform } from "react-native";
import { getDeviceName } from "react-native-device-info";
import i18n from "@/i18n";
import { getStreamingFetch } from "@/utils/streamingFetch";
import * as RNFS from "@dr.pogodin/react-native-fs";
import { createAttachmentSpooler, type AttachmentSink, type AttachmentSpooler } from "./attachmentSpooler";

export type Commands = 'workspaces' | 'workspace-content' | 'model-tag' | 'reset-chat' | 'new-thread' | 'unregister-device';
export type CommandResponses = {
    'workspaces': { workspaces: Array<{ id: number; name: string, slug: string, threadCount: number, chatCount: number, openAiPrompt: string, openAiTemp: number | null, topN: number, platform: 'server' | 'desktop' }> };
    'workspace-content': {
        workspace: { id: number; name: string, slug: string, openAiPrompt: string, openAiTemp: number | null, topN: number };
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
    'reset-chat': { workspaceSlug: string, threadSlug: string };
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

        let data: { token: string, platform: 'server' | 'desktop', error?: string } = { token: '', platform: 'server', error: i18n.t('common.unknown_error') };
        try { data = await response.json(); } catch { }

        if (!response.ok || !!data?.error) {
            console.error(`[${response.status}] Failed to register device: ${response.statusText}`, data);
            // Shown to the user on the Verify Connection screen
            throw new Error(i18n.t('connect.verify.register_failed_reason', { reason: data?.error ?? response.statusText }));
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

    /**
     * Sends a command and parses its JSON response. The body is streamed rather than read with the built in
     * `fetch`, which buffers the whole of it into one Java byte array first: `workspace-content` carries every
     * image attachment in the workspace as base64 and has run devices out of memory that way (GH #151). Streamed,
     * each attachment's data URL is written to a file in `attachmentsDir` as it arrives and replaced in the parsed
     * response by that file's `file://` URI; the caller owns the directory and deletes it. Without
     * `attachmentsDir` attachment contents are dropped.
     * `onProgress` reports the bytes received so far, against the body's size when the server sent one.
     * @throws {ResponseTooLargeError} when the body is still over `MAX_COMMAND_RESPONSE_LENGTH` without its attachments
     */
    async sendCommand<T extends Commands>(
        command: T,
        body?: CommandBodies[T],
        { attachmentsDir, onProgress }: { attachmentsDir?: string, onProgress?: DownloadProgressCallback } = {}
    ): Promise<CommandResponses[T]> {
        const aborter = new AbortController();
        const response = await getStreamingFetch()(`${this.connectionUrl}/send/${command}`, {
            method: 'POST',
            body: body ? JSON.stringify(body) : undefined,
            headers: {
                'Content-Type': 'application/json',
                [AnythingLLMExternal.HEADER_AUTH_TOKEN]: this.deviceToken,
            },
            signal: aborter.signal,
            // @ts-ignore - react-native-fetch-api option
            reactNative: { textStreaming: true },
        });
        if (!response.ok) {
            aborter.abort();
            throw new Error('Failed to send command');
        }
        const spooler = createAttachmentSpooler(attachmentsDir ? fileAttachmentSink(attachmentsDir) : undefined);
        try {
            return JSON.parse(await readSpooledText(response, spooler, onProgress));
        } catch (error) {
            aborter.abort();
            throw error;
        }
    }
}

/**
 * Bytes of a response received so far. `total` is null when the size is not known up front - a proxy that
 * compresses the response hides it, since Android drops `Content-Length` when it decompresses.
 */
export type DownloadProgressCallback = (received: number, total: number | null) => void;
/** Least time between two `onProgress` calls */
const PROGRESS_INTERVAL_MS = 250;

/** Thrown when a command's response is too large to keep in memory, even with its attachments taken out. */
export class ResponseTooLargeError extends Error {
    constructor() {
        super('Response is too large to load on this device');
        this.name = 'ResponseTooLargeError';
    }
}

/** Parent of the per-sync folders `syncFromRemote` spools a workspace's image attachments into. */
export const WORKSPACE_SYNC_ATTACHMENTS_FOLDER = `${RNFS.CachesDirectoryPath}/workspace-sync`;

/** Most text a command response may hold once attachments are taken out; the request is cut off past it. */
const MAX_COMMAND_RESPONSE_LENGTH = 64 * 1024 * 1024;

async function readSpooledText(response: Response, spooler: AttachmentSpooler, onProgress?: DownloadProgressCallback): Promise<string> {
    const reader = (response as any).body.getReader();
    const decoder = new (globalThis as any).TextDecoder();
    const total = Number(response.headers.get('content-length')) || null;
    let received = 0;
    let reportedAt = 0;
    let text = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (onProgress && Date.now() - reportedAt >= PROGRESS_INTERVAL_MS) {
            reportedAt = Date.now();
            onProgress(received, total);
        }
        text += await spooler.push(decoder.decode(value, { stream: true }));
        if (text.length > MAX_COMMAND_RESPONSE_LENGTH) throw new ResponseTooLargeError();
    }
    onProgress?.(received, total);
    return text + await spooler.push(decoder.decode()) + await spooler.finish();
}

/** Writes each attachment, decoded from base64, to its own numbered file in `dir`. */
function fileAttachmentSink(dir: string): AttachmentSink {
    let count = 0;
    let path = '';
    return {
        begin() {
            path = `${dir}/${count++}`;
            return `file://${path}`;
        },
        write(base64) {
            return RNFS.appendFile(path, base64, 'base64');
        },
    };
}

export default AnythingLLMExternal;