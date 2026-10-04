import { type ToolExecutionContext } from "@/utils/ToolsManager";
import { type BrowserAgentResume } from "@/utils/BrowserUse/agent";
import BrowserTraces from "@/utils/BrowserUse/traces";

/**
 * `continue_session`: finding the chat's latest browser session to pick up from. Sessions are
 * saved with the chat as `browser_use_session` actions on the assistant's responses.
 */

/**
 * Sessions started earlier in the same turn (keyed by the turn's history array - the one object
 * every tool call of a turn shares). They are not in the history yet, but a second call in the
 * same reply should continue them too.
 */
const sessionsThisTurn = new WeakMap<object, string>();

/** Remember a session started in this turn, for a later call in the same reply. */
export function rememberSession(context: ToolExecutionContext, sessionId: string) {
    if (context.history) sessionsThisTurn.set(context.history, sessionId);
}

/** The chat's latest browser session: one started earlier in this turn, else the newest saved with the chat. */
export function lastSessionOf(context: ToolExecutionContext): string | null {
    const history = context.history;
    if (!history) return null;
    const thisTurn = sessionsThisTurn.get(history);
    if (thisTurn) return thisTurn;
    for (let i = history.length - 1; i >= 0; i--) {
        const actions = history[i]?.response?.actions || [];
        for (let j = actions.length - 1; j >= 0; j--) {
            const action = actions[j];
            if (action?.type === 'browser_use_session' && action.action?.sessionId) return action.action.sessionId;
        }
    }
    return null;
}

/** What a continued session starts from: the earlier session's trace (its profile, last page and results). Null once its history was deleted. */
export async function resumeFrom(sessionId: string): Promise<BrowserAgentResume | null> {
    const trace = await BrowserTraces.get(sessionId);
    return trace ? { from: trace } : null;
}
