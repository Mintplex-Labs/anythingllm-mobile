/**
 * Port of `collector/utils/extensions/YoutubeTranscript` from AnythingLLM core.
 *
 * Core leans on `youtube-transcript-plus` + `youtubei.js`, neither of which bundles under Metro
 * (node:fs, node:path, heavy Innertube client). The flow itself is only three fetches, so it lives
 * here in-house where we can patch it the next time YouTube shifts things around:
 *   1. GET the watch page and pull the INNERTUBE_API_KEY out of it.
 *   2. POST /youtubei/v1/player as the ANDROID client - returns caption tracks and videoDetails
 *      (title, author, description, views) so we do not need a second metadata client.
 *   3. GET the chosen caption track's XML and flatten it to text.
 *
 * A YouTube link never falls through to the WebView scraper - a watch page renders no useful text,
 * so when there is no transcript we throw and the caller reports it.
 */

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Each request gets its own budget so a stalled hop cannot hang the tool call. */
const REQUEST_TIMEOUT_MS = 15_000;

/** Same pattern as core `validYoutubeVideoUrl` - watch, youtu.be, embed, v, live and shorts URLs. */
const RE_YOUTUBE_VIDEO = /^(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?(?:.*&)?v=|(?:live\/)?|shorts\/))([\w-]{11})(?:\S+)?$/;

/** Legacy caption XML: <text start="1.2" dur="3.4">...</text> */
const RE_XML_TEXT = /<text[^>]*>([\s\S]*?)<\/text>/g;
/** srv3 caption XML: <p t="1200" d="3400">...<s>word</s>...</p> */
const RE_SRV3_P = /<p\b[^>]*>([\s\S]*?)<\/p>/g;

export type YoutubeVideoMetadata = {
    title: string;
    author: string;
    description: string;
    viewCount: string;
};

export type YoutubeTranscriptResult = {
    videoId: string;
    transcript: string;
    metadata: YoutubeVideoMetadata;
};

type CaptionTrack = { baseUrl?: string; languageCode?: string; kind?: string };

export class YoutubeTranscriptError extends Error {
    constructor(message: string) {
        super(`[YoutubeTranscript] ${message}`);
        this.name = 'YoutubeTranscriptError';
    }
}

function log(text: string, ...args: any[]) {
    console.log(`\x1b[35m[YoutubeTranscript] ${text}\x1b[0m`, ...args);
}

/**
 * Return the 11 character video id when the link is a YouTube video URL, otherwise null.
 * Accepts links with or without a protocol.
 */
export function youtubeVideoId(link: string | null | undefined): string | null {
    if (!link || typeof link !== 'string') return null;
    let candidate = link.trim();
    if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;
    try {
        new URL(candidate);
    } catch {
        return null;
    }
    return candidate.match(RE_YOUTUBE_VIDEO)?.[1] ?? null;
}

export function isYoutubeVideoUrl(link: string | null | undefined): boolean {
    return youtubeVideoId(link) !== null;
}

function decodeEntities(text: string): string {
    return text
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

/** Flatten caption XML (legacy or srv3) into a single line of text. */
export function parseCaptionXml(xml: string): string {
    let matches = [...xml.matchAll(RE_XML_TEXT)];
    if (!matches.length) matches = [...xml.matchAll(RE_SRV3_P)];
    return matches
        // Inner tags (<s>, <font>) are stripped before decoding so escaped brackets in captions survive.
        // Caption text arrives double-escaped (`&amp;#39;`) so it is decoded twice.
        .map(m => decodeEntities(decodeEntities(m[1].replace(/<[^>]+>/g, ''))))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Pick the caption track to read. Mirrors core's scoring: earlier preferred language wins and a
 * human transcript beats an auto-generated (asr) one of the same language. When nothing matches
 * we still take the best remaining track rather than fail - any transcript beats none.
 */
export function pickCaptionTrack(tracks: CaptionTrack[], preferredLanguages: string[]): CaptionTrack | null {
    if (!tracks.length) return null;
    const score = (track: CaptionTrack) => {
        const code = (track.languageCode ?? '').toLowerCase();
        let index = preferredLanguages.findIndex(lang => code === lang || code.split('-')[0] === lang);
        if (index === -1) index = 9999;
        return index + (track.kind === 'asr' ? 0.5 : 0);
    };
    return [...tracks].sort((a, b) => score(a) - score(b))[0];
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        return await fetch(url, {
            ...init,
            headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9', ...(init.headers ?? {}) },
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Fetch the transcript and basic metadata for a YouTube video.
 * @param url Any YouTube video URL (see `youtubeVideoId`).
 * @param preferredLanguages Language codes in preference order, english is always appended last.
 * @throws YoutubeTranscriptError when the video is unavailable or has no transcript.
 */
export async function fetchYoutubeTranscript(url: string, preferredLanguages: string[] = []): Promise<YoutubeTranscriptResult> {
    const videoId = youtubeVideoId(url);
    if (!videoId) throw new YoutubeTranscriptError('Invalid URL. Should be youtu.be or youtube.com/watch.');
    const languages = [...new Set([...preferredLanguages.map(l => l.toLowerCase()), 'en'])];

    log(`Fetching transcript for ${videoId}`);
    const watchRes = await fetchWithTimeout(`https://www.youtube.com/watch?v=${videoId}`, { credentials: 'omit' });
    if (!watchRes.ok) throw new YoutubeTranscriptError(`Video ${videoId} is unavailable (HTTP ${watchRes.status}).`);
    const watchBody = await watchRes.text();
    if (watchBody.includes('class="g-recaptcha"'))
        throw new YoutubeTranscriptError('YouTube is rate limiting requests from this network. Try again later.');

    const apiKey = watchBody.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1]
        ?? watchBody.match(/INNERTUBE_API_KEY\\":\\"([^\\"]+)\\"/)?.[1];
    if (!apiKey) throw new YoutubeTranscriptError('No transcript is available for this video.');

    const playerRes = await fetchWithTimeout(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } },
            videoId,
        }),
    });
    if (!playerRes.ok) throw new YoutubeTranscriptError(`Video ${videoId} is unavailable (HTTP ${playerRes.status}).`);
    const player = await playerRes.json();

    const tracks: CaptionTrack[] = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    const track = pickCaptionTrack(tracks, languages);
    if (!track?.baseUrl) {
        const playable = player?.playabilityStatus?.status === 'OK';
        throw new YoutubeTranscriptError(playable
            ? 'Transcripts are disabled for this video.'
            : 'No transcript is available for this video.');
    }

    // Drop any fmt param so YouTube serves the XML format parseCaptionXml understands.
    const captionRes = await fetchWithTimeout(track.baseUrl.replace(/&fmt=[^&]+/, ''));
    if (captionRes.status === 429) throw new YoutubeTranscriptError('YouTube is rate limiting requests from this network. Try again later.');
    if (!captionRes.ok) throw new YoutubeTranscriptError('No transcript is available for this video.');

    const transcript = parseCaptionXml(await captionRes.text());
    if (!transcript) throw new YoutubeTranscriptError('No transcript could be parsed for this video.');

    const details = player?.videoDetails ?? {};
    return {
        videoId,
        transcript,
        metadata: {
            title: details.title ?? '',
            author: details.author ?? '',
            description: details.shortDescription ?? '',
            viewCount: details.viewCount ?? '',
        },
    };
}

/**
 * Same shape core's `buildTranscriptContentWithMetadata` produces, so prompts like "how many views
 * does this have" or "what links are in the description" work the same on mobile and desktop.
 */
export function buildTranscriptContent({ transcript, metadata }: Pick<YoutubeTranscriptResult, 'transcript' | 'metadata'>): string {
    const fields: [string, string][] = [
        ['title', metadata.title],
        ['author', metadata.author],
        ['description', metadata.description],
        ['view_count', metadata.viewCount],
    ];
    const header = fields.filter(([, value]) => !!value).map(([key, value]) => `<${key}>${value}</${key}>`).join('');
    if (!header) return transcript;
    return `${header}\nTranscript:\n${transcript}`;
}
