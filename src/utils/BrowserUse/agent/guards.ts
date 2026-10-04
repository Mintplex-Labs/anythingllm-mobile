import { clip } from '../text';

/**
 * Actions the agent refuses to run, with the reason told to the model instead. Small models make
 * these mistakes constantly: typing "YOUR_PASSWORD", inventing product URLs, screenshotting every step.
 */

// Ids in a URL path (product 695807, ASIN B0CHX1W1XY) cannot be guessed - only ones the agent saw count.
const ID_TOKEN = /\d{5,}|\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{8,12}\b/g;

// Made-up stand-ins for real values ("YOUR_PASSWORD", "[Your Apple ID]") must never be typed.
const PLACEHOLDER_TEXT = [
    /^\s*[[<{(]\s*(your|enter|insert)\b[^\]>})]*[\]>})]\s*$/i,
    /^\s*(your|enter|insert)[\s_-]+(user ?name|email|e-mail|password|passcode|phone( number)?|apple id|id|code|otp|account)\b/i,
    /^[A-Z0-9]+(_[A-Z0-9]+)*_(USER(NAME)?|EMAIL|PASSWORD|PHONE|CODE|OTP|NAME|ID)\b/,
];

/** The product, listing and post ids in a text or URL */
export function idTokensIn(text: unknown): string[] {
    return String(text || '').match(ID_TOKEN) || [];
}

/**
 * The id in a navigate's address that never appeared on a page, in the task or in a visited URL -
 * the address is probably made up. Only the path is checked, so search URLs with any query work.
 */
export function madeUpId(url: string, seenIds: Set<string>): string | null {
    let path: string;
    try {
        path = decodeURIComponent(new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).pathname);
    } catch {
        return null;
    }
    return idTokensIn(path).find((idToken) => !seenIds.has(idToken)) || null;
}

/** Why the agent's action must not run - or null when it may. */
export function refusalFor(
    { name, args }: { name: string; args: Record<string, any> },
    { seenIds, vision, screenshotsLeft, lastAction }: { seenIds: Set<string>; vision: boolean; screenshotsLeft: number; lastAction: string | null },
): string | null {
    if (name === 'type' && PLACEHOLDER_TEXT.some((re) => re.test(String(args.text ?? ''))))
        return `Not typed: "${clip(args.text, 60)}" is a placeholder, not a real value. Never type made-up credentials or details. If you need them, call ask_user and ask the user to sign in in the browser.`;

    const madeUp = name === 'navigate' ? madeUpId(args.url, seenIds) : null;
    if (madeUp)
        return `Not opened: ${clip(args.url, 120)} contains an id (${madeUp}) that is not on any page you saw, so the address is probably made up. Click the link on the page, or use the site's search, instead.`;

    if (name !== 'screenshot') return null;
    if (!vision) return 'There is no tool named "screenshot".';
    if (screenshotsLeft <= 0) return 'No screenshots left for this session. Use the page state.';
    if (lastAction === 'screenshot') return 'You just took a screenshot. Act on it or use the page state.';
    return null;
}
