/** Types shared by the browser session (what an action did) and the agent (what it makes of it). */

export type PageInfo = { url: string; title: string; favicon: string };

/** `wall` is a confident match (the agent pauses for the user); otherwise the form is merely present. */
export type Blocker = { kind: 'login' | 'captcha' | 'verification'; wall: boolean; score: number };

/** A same-site write request observed during an action - how the agent knows something was really sent. */
export type SentRequest = { label: string; method: string; target: string; status: number | null; ok: boolean | null };

export type ActionResult = {
    ok: boolean;
    /** One line, what happened - kept in the agent's history */
    outcome: string;
    /** The full page state - only the latest is kept in context */
    state: string;
    page: PageInfo;
    /** Small jpeg (base64) for the session trace */
    thumbnail: string | null;
    /** Label of the element acted on */
    target?: string;
    /** The action typed into a password field */
    sensitive?: boolean;
    blocker?: Blocker | null;
    /** The user drove the browser themselves since the agent last looked */
    tookOver?: boolean;
    /** Screenshot action only: small jpeg (base64) for vision models */
    image?: string;
    sent?: SentRequest[];
};
