/**
 * Tuning knobs for the browser agent, in one place. The values match the desktop agent unless a
 * comment says why mobile differs.
 */

/////////////////////////////
// Session budget
/////////////////////////////

/** Browser actions per session before the agent must answer */
export const MAX_STEPS = 40;
/** Plain-text replies (no tool call) tolerated before the session ends */
export const MAX_NUDGES = 2;
/** Prompt + completion tokens over all calls of one session. Past it the agent wraps up. */
export const MAX_SESSION_TOKENS = 200_000;
/** How long the agent waits for the user to answer a question */
export const HELP_TIMEOUT_MS = 15 * 60_000;

/////////////////////////////
// Giving up (see agent/progress.ts)
/////////////////////////////

// A step makes progress when it shows the agent something new: a new page, new page content or a
// new note. After STALL_WARN steps in a row without progress the agent is warned; at STALL_LIMIT the
// session ends and hands back what it found.
export const STALL_WARN = 5;
export const STALL_LIMIT = 8;
// Drift: new pages keep coming but nothing on them relates to the task (clicking around a site's
// menus). At DRIFT_CHECK it triggers a progress check; at DRIFT_LIMIT the session ends.
export const DRIFT_CHECK = 4;
export const DRIFT_LIMIT = 12;
/** A cycle of 1-3 actions repeated this many times in a row counts as a loop */
export const LOOP_REPEATS = 3;

/////////////////////////////
// Reflection calls (see agent/reflection.ts)
/////////////////////////////

/** A progress check runs at least every CHECK_EVERY steps... */
export const CHECK_EVERY = 10;
/** ...and at most this many times per session */
export const MAX_CHECKPOINTS = 4;
/** How often the final-answer pass may send the agent back to work - small models stop after the first site */
export const MAX_DONE_CHECKS = 2;

/////////////////////////////
// What the model sees
/////////////////////////////

/** Page state budget in characters: ~15% of the context window, kept within these bounds */
export const PAGE_STATE_MIN_CHARS = 3_000;
export const PAGE_STATE_MAX_CHARS = 6_000;
/** Notes the agent saved with its actions (prices, names, links), shown on every turn */
export const MAX_NOTES = 20;
/** Page digests: the most relevant lines of each visited page, so leaving a page does not erase it */
export const DIGEST_LINES = 5;
export const DIGEST_PAGES = 6;
/** Continuing a session: how many earlier tasks of the same browser the agent is told about */
export const MAX_EARLIER_TASKS = 3;

/////////////////////////////
// Images
/////////////////////////////

/** Screenshots are a last resort for vision models, not an every-step habit */
export const MAX_SCREENSHOTS = 3;
// Kept small. A phone screen is tall, so these are narrower than desktop's.
export const SCREENSHOT_WIDTH = 540;
export const SCREENSHOT_QUALITY = 50;
/** The live frame in the chat card and the step thumbnails in the trace */
export const THUMBNAIL_WIDTH = 320;
export const THUMBNAIL_QUALITY = 45;

/////////////////////////////
// Traces
/////////////////////////////

/** Trace writes carry every thumbnail - batch them instead of writing after every step */
export const TRACE_SAVE_INTERVAL_MS = 3_000;
/** Step thumbnails make a trace up to ~1MB, so keep fewer than desktop's 200 */
export const MAX_TRACES = 50;
