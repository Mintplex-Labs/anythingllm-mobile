import * as RNFS from '@dr.pogodin/react-native-fs';
import DocumentParser, { getExtension, resolveDocument } from '@/utils/DocumentParser';
import type { DocumentKind } from '@/utils/DocumentParser';
import { generateUUID } from '@/utils/constants';
import NetInfo from '@react-native-community/netinfo';
import AwaitableAlert from '@/components/AwaitableAlert';

/**
 * Port of `collector/processLink/helpers/index.js` from AnythingLLM core.
 *
 * When the model asks to scrape a URL that actually points at a document we can already parse
 * (PDF, Word, Excel, PowerPoint) we download it, extract the text and return that as the scrape
 * result instead of letting the WebView render a binary blob.
 *
 * Anything we do not explicitly know how to parse is treated as a regular web link and goes
 * through the WebView scraper as before - `application/octet-stream`, missing headers, HEAD
 * failures and plain html/text all fall through.
 *
 * Downloads are strictly ephemeral: each one lands in its own folder under the OS temp
 * directory and is removed in a `finally` whether parsing succeeded or not. Anything left over
 * from a previous crashed run is swept on the next call so nothing accumulates in user storage.
 */

/** Folder under the OS temp directory that only this module writes to, so it is safe to wipe. */
export const LINK_DOWNLOADS_FOLDER_PATH = `${RNFS.TemporaryDirectoryPath}/link-downloads`;

/** Refuse to pull anything larger than this onto the device - 50 MB. */
export const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;

/**
 * On cellular, downloads above this size (or of unknown size) ask the user first - 5 MB.
 * On wifi we do not prompt at all.
 */
export const CELLULAR_PROMPT_BYTES = 5 * 1024 * 1024;

/** HEAD probe budget, matches core. */
const HEAD_TIMEOUT_MS = 5_000;

/** Whole download budget so a slow host cannot hang the tool call. */
const DOWNLOAD_TIMEOUT_MS = 60_000;

/** Document kinds we will download and parse. html/text are always scraped as web pages. */
const FILE_KINDS: ReadonlySet<DocumentKind> = new Set<DocumentKind>(['pdf', 'docx', 'spreadsheet', 'pptx']);

export type LinkContentType = {
    /** Mime type without charset or other parameters, lowercased. Null when unknown. */
    contentType: string | null;
    /** Content-Length header when the server reports one. */
    contentLength: number | null;
};

function log(text: string, ...args: any[]) {
    console.log(`\x1b[36m[LinkAsFile] ${text}\x1b[0m`, ...args);
}

/** Strip charset and any other parameters from a Content-Type header. */
export function parseContentType(header: string | null | undefined): string | null {
    if (!header) return null;
    return header.toLowerCase().split(';')[0].trim() || null;
}

/** Best-effort filename from the last URL path segment (query and hash stripped, decoded). */
export function filenameFromUrl(url: string): string {
    try {
        const pathname = new URL(url).pathname;
        const last = pathname.split('/').filter(Boolean).pop() ?? '';
        return decodeURIComponent(last);
    } catch {
        return '';
    }
}

/**
 * HEAD the URL and read its Content-Type. Any failure resolves to nulls so the caller falls back
 * to a normal web scrape - a probe failing must never fail the tool call.
 */
export async function getContentTypeFromURL(url: string): Promise<LinkContentType> {
    const empty: LinkContentType = { contentType: null, contentLength: null };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS);
    try {
        const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
        if (!res.ok) return empty;
        const lengthHeader = res.headers.get('Content-Length');
        const contentLength = lengthHeader ? Number.parseInt(lengthHeader, 10) : NaN;
        return {
            contentType: parseContentType(res.headers.get('Content-Type')),
            contentLength: Number.isFinite(contentLength) ? contentLength : null,
        };
    } catch (e) {
        log(`HEAD failed for ${url}: ${e instanceof Error ? e.message : String(e)}`);
        return empty;
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Decide whether a URL should be downloaded and parsed as a file.
 * Only the Content-Type header decides - a URL ending in `.pdf` that serves html is a web page,
 * and `/download/report` that serves `application/pdf` is a file. The filename from the URL is
 * kept purely for display and for the extractor's extension hint.
 */
export function resolveLinkAsFile(url: string, contentType: string | null): { kind: DocumentKind; fileName: string } | null {
    if (!contentType) return null;
    const resolved = resolveDocument('', contentType);
    if (!resolved || !FILE_KINDS.has(resolved.kind)) return null;
    const ext = extensionForKind(resolved.kind, contentType);
    const urlName = filenameFromUrl(url);
    // Force the extension that matches the header so the extractor never picks the wrong parser
    // from a misleading URL segment (e.g. `/export.html` that actually serves a PDF).
    const base = urlName ? urlName.replace(/\.[a-z0-9]+$/i, '') : 'download';
    return { kind: resolved.kind, fileName: `${base}.${ext}` };
}

function extensionForKind(kind: DocumentKind, contentType: string): string {
    switch (kind) {
        case 'pdf': return 'pdf';
        case 'docx': return 'docx';
        case 'pptx': return 'pptx';
        case 'spreadsheet':
            if (contentType.includes('ms-excel') && !contentType.includes('sheet')) return 'xls';
            if (contentType.includes('opendocument')) return 'ods';
            return 'xlsx';
        default: return 'bin';
    }
}

function formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Data-usage guard. Wifi (or an unknown network) never prompts. On cellular we ask before
 * pulling anything over `CELLULAR_PROMPT_BYTES`, and also when the server did not tell us the
 * size since we cannot rule out a large file. Resolves false when the user declines.
 */
export async function confirmDownloadOnCellular(fileName: string, contentLength: number | null): Promise<boolean> {
    let netType: string | null = null;
    try {
        netType = (await NetInfo.fetch()).type;
    } catch {
        return true;
    }
    if (netType !== 'cellular') return true;
    if (contentLength !== null && contentLength <= CELLULAR_PROMPT_BYTES) return true;

    const sizeLabel = contentLength !== null ? formatBytes(contentLength) : 'an unknown size';
    return await AwaitableAlert(
        'Download on cellular?',
        `Reading "${fileName}" requires downloading a document of ${sizeLabel}. You are on cellular data. Continue?`,
        { text: 'Cancel', style: 'cancel' },
        { text: 'Download' },
    );
}

/** Thrown when the user declines a cellular download so the tool can report it distinctly. */
export class DownloadDeclinedError extends Error {
    constructor() {
        super('Download declined by the user.');
        this.name = 'DownloadDeclinedError';
    }
}

/** Remove everything this module ever downloaded. Safe to call at any time. */
export async function purgeLinkDownloads(): Promise<void> {
    try {
        if (await RNFS.exists(LINK_DOWNLOADS_FOLDER_PATH)) await RNFS.unlink(LINK_DOWNLOADS_FOLDER_PATH);
    } catch (e) {
        log(`Failed to purge link downloads: ${e instanceof Error ? e.message : String(e)}`);
    }
}

/**
 * Download the URL to a throwaway folder, extract its text and delete the download.
 * The file never outlives this call. Throws when the download or extraction fails so the caller
 * can surface a message - it does not fall back to a web scrape since we already know the
 * resource is a binary document.
 */
export async function processLinkAsFile({
    url,
    contentType,
    contentLength,
}: { url: string; contentType: string; contentLength: number | null }): Promise<{ content: string; fileName: string; mimeType: string }> {
    const resolved = resolveLinkAsFile(url, contentType);
    if (!resolved) throw new Error(`Unsupported document type (${contentType}).`);
    if (contentLength !== null && contentLength > MAX_DOWNLOAD_BYTES)
        throw new Error(`Document is too large to download (${formatBytes(contentLength)}).`);
    if (!(await confirmDownloadOnCellular(resolved.fileName, contentLength))) throw new DownloadDeclinedError();

    // Sweep anything a previous crashed run left behind before adding to the folder.
    await purgeLinkDownloads();

    const jobFolder = `${LINK_DOWNLOADS_FOLDER_PATH}/${generateUUID()}`;
    const toFile = `${jobFolder}/document.${getExtension(resolved.fileName)}`;

    try {
        await RNFS.mkdir(jobFolder);
        log(`Downloading ${url} -> ${toFile}`);

        const { jobId, promise } = RNFS.downloadFile({
            fromUrl: url,
            toFile,
            connectionTimeout: DOWNLOAD_TIMEOUT_MS,
            readTimeout: DOWNLOAD_TIMEOUT_MS,
            begin: res => {
                // Servers that omit Content-Length on HEAD often report it once the GET starts.
                if (res.contentLength > MAX_DOWNLOAD_BYTES) RNFS.stopDownload(jobId);
            },
        });
        const result = await promise;
        if (result.statusCode < 200 || result.statusCode >= 300)
            throw new Error(`Download failed with HTTP ${result.statusCode}.`);

        const stat = await RNFS.stat(toFile);
        if (Number(stat.size) > MAX_DOWNLOAD_BYTES)
            throw new Error('Document is too large to process.');

        const content = await DocumentParser.extractText(toFile, resolved.fileName, contentType);
        return { content, fileName: resolved.fileName, mimeType: contentType };
    } finally {
        // Always drop the download - the parsed text is all we keep.
        await RNFS.unlink(jobFolder).catch(() => {});
        await purgeLinkDownloads();
    }
}
