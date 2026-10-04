/** An address the user or model typed, as a full http(s) URL - or null when it is not a web address. */
export function normalizeUrl(input: string) {
    const raw = String(input || '').trim();
    if (!raw) return null;
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    try {
        const url = new URL(withScheme);
        if (!['http:', 'https:'].includes(url.protocol)) return null;
        return url.toString();
    } catch {
        return null;
    }
}

/** "amazon.com" for https://www.amazon.com/cart (the scheme may be missing). Null when it is not an address. */
export function hostOf(url: unknown): string | null {
    const raw = String(url ?? '');
    if (!raw) return null;
    try {
        return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).host.replace(/^www\./, '');
    } catch {
        return null;
    }
}

/** Same site = same last two host labels (x.com / api.x.com, www.linkedin.com / linkedin.com). */
export function sameSite(host: string, pageUrl: string) {
    try {
        const tail = (h: string) => h.split('.').slice(-2).join('.');
        return tail(host) === tail(new URL(pageUrl).hostname);
    } catch {
        return false;
    }
}

/**
 * Asked for a specific page and ended up somewhere else (x.com/home -> x.com/i/flow/login) - a
 * strong sign of a sign-in redirect. Homepages are ignored since they legitimately redirect
 * (regional domains, locales).
 */
export function bouncedAway(requested: string, landed: string) {
    try {
        const [from, to] = [new URL(requested), new URL(landed)];
        const path = (u: URL) => u.pathname.replace(/\/$/, '');
        if (!path(from)) return false;
        return path(from) !== path(to);
    } catch {
        return false;
    }
}
