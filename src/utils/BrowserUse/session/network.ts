import { sameSite } from '../urls';
import { type SentRequest } from '../types';

/**
 * "Was it really sent?" - the page script records every request the page makes
 * (NETWORK_WATCH_SCRIPT in pageScript.ts); this decides which of them mean the page sent
 * something to the site, and how that is put to the model.
 */

/** One request as the page script recorded it */
export type NetEntry = { at: number; method: string; url: string; body: string; status: number | null; ok: boolean | null };

// Analytics, logging and tracking endpoints POST constantly - they are not "the page sent something".
const TRACKING_PATH = /\/(track|tracking|collect|beacon|log|logs|logging|analytics|metrics|telemetry|events?|rum|pixel|ping|sentry|csp-report|li\/track|jot|1p-user-list|pagead)\b/i;
// GraphQL reads are sent as POST too.
const READ_ONLY_GRAPHQL = /"query"\s*:\s*"\s*(query\b|\{)/;

/** The requests that count as sending something: same site as the page, not tracking, not reads. */
export function sentRequests(entries: NetEntry[], pageUrl: string): SentRequest[] {
    const sent = new Map<string, SentRequest>();
    for (const entry of entries) {
        let url: URL;
        try { url = new URL(entry.url); } catch { continue; }
        if (!sameSite(url.hostname, pageUrl) || TRACKING_PATH.test(url.pathname)) continue;
        if (entry.method === 'WS') {
            // One per socket - chat apps send many frames for one message.
            sent.set(`ws:${url.host}`, { label: 'websocket message', method: 'WS', target: url.host, status: null, ok: true });
            continue;
        }
        if (READ_ONLY_GRAPHQL.test(entry.body || '')) continue;
        const operation = (entry.body || '').match(/"operationName"\s*:\s*"([\w-]{2,60})"/)?.[1] || null;
        sent.set(`${entry.at}:${entry.method}:${entry.url}`, {
            label: operation || lastSegment(url),
            method: entry.method,
            target: shortTarget(url),
            status: entry.status,
            ok: entry.ok,
        });
    }
    return [...sent.values()];
}

/** "200 OK", "500 (failed)", "sent" (websocket) or "no reply yet" */
export function sentStatus(request: Pick<SentRequest, 'method' | 'status' | 'ok'>) {
    if (request.method === 'WS') return 'sent';
    if (request.status) return `${request.status}${request.ok ? ' OK' : ' (failed)'}`;
    return request.ok === false ? 'failed' : 'no reply yet';
}

/** The "Sent to the site: ..." part of an action's outcome */
export function describeSent(sent: SentRequest[]) {
    const shown = sent.slice(0, 3).map((r) => {
        if (r.method === 'WS') return `a websocket message on ${r.target}`;
        const operation = r.label !== lastPathPart(r.target) ? ` (${r.label})` : '';
        return `${r.method} ${r.target}${operation} -> ${sentStatus(r)}`;
    });
    return shown.join('; ') + (sent.length > 3 ? `; and ${sent.length - 3} more` : '');
}

/** host + path with ids/hashes collapsed, e.g. x.com/i/api/graphql/…/CreateTweet */
function shortTarget(url: URL) {
    const path = url.pathname
        .split('/')
        .map((part) => (isOpaqueId(part) ? '…' : part))
        .join('/');
    const text = `${url.host.replace(/^www\./, '')}${path}`;
    return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

// Ids, hashes and tokens in a path say nothing to the model - collapse them.
function isOpaqueId(part: string) {
    if (part.length > 24 || /^[0-9a-f-]{12,}$/i.test(part) || /^\d{5,}$/.test(part)) return true;
    return part.length >= 16 && /\d/.test(part) && /[a-z]/i.test(part);
}

/** A readable name for a request without a GraphQL operation: the last word-like path part */
function lastSegment(url: URL) {
    const parts = url.pathname.split('/').filter((p) => p && p.length <= 40 && !/^\d+$/.test(p));
    return parts.at(-1) || url.host;
}

function lastPathPart(target: string) {
    return target.split('/').filter(Boolean).at(-1) || '';
}
