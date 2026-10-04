import { clip, stripThinking } from '../text';
import { type BrowserTraceStep } from '../traces';

/**
 * The two model calls made outside the action loop, each a short question over everything the
 * agent collected. Small models judge "am I done / on track?" far better as its own question than
 * while picking clicks. What the agent does with the answers is in agent/index.ts.
 */

/** What both calls are shown, already formatted (see ./prompts.ts) */
type Collected = {
    task: string;
    earlier: string;
    notes: string;
    visited: string;
    sent: string;
};

/////////////////////////////
// Progress check
/////////////////////////////

export type Verdict = 'CONTINUE' | 'FINISH' | 'BACK' | 'GIVE_UP';

const CHECKPOINT_SYSTEM = `You check on a browser agent that is doing a task for the user. Decide what it should do next. Reply with ONE word on the first line:
CONTINUE - it is on track and the task needs more work.
FINISH - the information below already answers the task (or the task's action is done), so it should stop and answer now.
BACK - it wandered off to pages unrelated to the task and should return to the most useful page.
GIVE_UP - the site clearly does not have what the task needs, or there is no realistic way forward.
Prefer FINISH over BACK when the useful pages above already show what the task asks for.
On the second line write one short sentence: for CONTINUE or BACK, the single next step to take; for FINISH or GIVE_UP, why.`;

export function checkpointMessages({ task, earlier, notes, visited, sent, steps, page }: Collected & { steps: BrowserTraceStep[]; page: string }) {
    const recent = steps
        .slice(-8)
        .map((s) => `- ${s.label}${s.ok ? '' : ' (failed)'}${s.title ? ` - on "${clip(s.title, 60)}"` : ''}`)
        .join('\n');
    return [
        { role: 'system', content: CHECKPOINT_SYSTEM },
        { role: 'user', content: `Task: ${task}${earlier}\n\nAgent notes:\n${notes}${visited}${sent}\n\nLast steps:\n${recent}\n\nCurrent page:\n${clip(page, 2_000)}` },
    ];
}

/** The verdict and its one-sentence reason. Null when the reply has no verdict. */
export function parseCheckpoint(reply: string): { verdict: Verdict; reason: string } | null {
    const lines = stripThinking(reply)
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    const word = lines[0]?.match(/\b(CONTINUE|FINISH|BACK|GIVE[_ ]?UP)\b/i)?.[1];
    if (!word) return null;
    const verdict = word.toUpperCase().replace(/^GIVE[_ ]?UP$/, 'GIVE_UP') as Verdict;
    const reason = clip((lines[0] || '').replace(/^\W*(CONTINUE|FINISH|BACK|GIVE[_ ]?UP)\W*/i, '') || lines[1] || '', 200);
    return { verdict, reason };
}

/////////////////////////////
// Final answer
/////////////////////////////

const FINAL_ANSWER_SYSTEM = 'You write the final answer of a browser agent for the user, using ONLY the information collected below - never invent facts. Include the concrete values, names and links the task asks for. If the agent hit a real blocker (sign-in needed, site blocked, item does not exist), explain it. If the task was to post, send or submit something, only say it went through when "Data sent to sites" shows it - otherwise say it may not have been sent.';

/**
 * Turns the agent's `done` into the final answer - small models write `done` from the last page
 * only. With `askMissing` the model may instead say part of the task has no information yet.
 */
export function finalAnswerMessages({ task, earlier, notes, visited, sent, page, draft, askMissing }: Collected & { page: string; draft: string; askMissing: boolean }) {
    const firstLine = askMissing ? 'COMPLETE, or MISSING: <what part of the task has no information yet, in a few words>' : 'COMPLETE';
    return [
        { role: 'system', content: FINAL_ANSWER_SYSTEM },
        {
            role: 'user',
            content: `Task: ${task}${earlier}\n\nAgent notes:\n${notes}${visited}${sent}\n\nLast page:\n${clip(page, 3_000)}\n\nAgent's draft answer:\n${draft || '(none)'}\n\nReply in this format:\nFirst line: ${firstLine}\nThen a blank line, then the final answer for the user.`,
        },
    ];
}

/** The answer (the draft when the reply has none) and, when allowed, what is still missing. */
export function parseFinalAnswer(reply: string, { draft, askMissing }: { draft: string; askMissing: boolean }): { missing: string | null; answer: string } {
    const [first = '', ...rest] = stripThinking(reply).trim().split('\n');
    const answer = rest.join('\n').trim() || draft;
    const missing = first.match(/^\W*MISSING\W*:?\s*(.+)$/i)?.[1];
    return { missing: askMissing && missing ? clip(missing, 200) : null, answer };
}
