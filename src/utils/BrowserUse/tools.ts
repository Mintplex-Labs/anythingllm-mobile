/**
 * Tools, prompts and human-readable step labels for the browser sub-agent - a port of the desktop
 * server/utils/agents/aibitat/plugins/browser-use/tools.js. Descriptions are intentionally short:
 * the schemas are re-sent on every step.
 */
import i18n from '@/i18n';

export type BrowserToolSchema = {
    name: string;
    description: string;
    parameters: { type: 'object'; properties: Record<string, any>; required: string[] };
};

const schema = (properties: Record<string, any> = {}, required: string[] = []) => ({
    type: 'object' as const,
    properties,
    required,
});

const id = (what: string) => ({
    type: 'number',
    description: `[n] id of the ${what}.`,
});

/** Actions executed by the browser (see ./session.ts). */
export const BROWSER_TOOLS: BrowserToolSchema[] = [
    {
        name: 'navigate',
        description:
            'Open a URL in the browser. Use direct URLs when you know them (e.g. a search results URL). Never guess the address of a specific product, listing or post - click its link.',
        parameters: schema({ url: { type: 'string', description: 'The web address to open.' } }, ['url']),
    },
    {
        name: 'click',
        description: 'Click a link, button or any other element by its [n] id.',
        parameters: schema({ id: id('element') }, ['id']),
    },
    {
        name: 'type',
        description: 'Type text into an input by its [n] id. Replaces what is in the field. Set submit to press Enter afterwards.',
        parameters: schema(
            {
                id: id('input'),
                text: { type: 'string', description: 'The text to type.' },
                submit: { type: 'boolean', description: 'Press Enter after typing (default false).' },
            },
            ['id', 'text'],
        ),
    },
    {
        name: 'select_option',
        description: 'Choose an option in a dropdown (select) by its [n] id.',
        parameters: schema(
            {
                id: id('dropdown'),
                option: { type: 'string', description: 'The option text to pick.' },
            },
            ['id', 'option'],
        ),
    },
    {
        name: 'press_key',
        description: 'Press a key: Enter, Tab, Escape, Backspace, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, PageDown, PageUp.',
        parameters: schema({ key: { type: 'string' } }, ['key']),
    },
    {
        name: 'scroll',
        description: 'Scroll the page to reveal more content. Pass an element id to scroll inside a scrollable list or panel.',
        parameters: schema(
            {
                direction: { type: 'string', enum: ['down', 'up'] },
                id: id('scrollable panel (optional)'),
            },
            ['direction'],
        ),
    },
    {
        name: 'go_back',
        description: 'Go back to the previous page.',
        parameters: schema(),
    },
    {
        name: 'read_page',
        description: 'Read text in full. Pass [Tn] text ids to read specific blocks, or no ids to read the main content of the page.',
        parameters: schema({
            text_ids: {
                type: 'array',
                items: { type: 'number' },
                description: 'Text block numbers, e.g. [3, 4, 5] for T3-T5.',
            },
        }),
    },
    {
        name: 'wait',
        description: 'Wait for the page to finish loading or updating.',
        parameters: schema({
            seconds: { type: 'number', description: '1-10 seconds.' },
        }),
    },
];

// Only the latest page stays in context, so every browser action can carry a note: facts the agent
// must not lose (prices, names, links). Notes are shown on every turn for the rest of the task.
const NOTE_PARAM = {
    type: 'string',
    description: 'Optional facts to remember for the answer (prices, names, links).',
};
for (const tool of BROWSER_TOOLS) tool.parameters.properties.note = NOTE_PARAM;

/** Tools handled by the agent loop itself. */
export const CONTROL_TOOLS: BrowserToolSchema[] = [
    {
        name: 'ask_user',
        description:
            'Ask the user for help and wait for their reply. Use when you are blocked by a login, captcha, verification code, or need a decision only they can make. The user can take over the browser to help. For sign-ins, ask them to sign in themselves in the browser - never ask for passwords or codes in the chat.',
        parameters: schema(
            {
                question: { type: 'string', description: 'What you need from the user, short and specific.' },
            },
            ['question'],
        ),
    },
    {
        name: 'done',
        description: 'Finish the task. Call this when the task is complete or cannot be completed.',
        parameters: schema(
            {
                success: { type: 'boolean', description: 'Whether the task was completed.' },
                result: {
                    type: 'string',
                    description: 'The full answer for the user with the concrete facts, prices, names and links you found, or why it could not be done.',
                },
            },
            ['success', 'result'],
        ),
    },
];

/**
 * Only offered to models that accept images, and rationed by the agent loop (see agent.ts):
 * a small jpeg, a few per session, never twice in a row, and only the latest stays in context.
 */
export const SCREENSHOT_TOOL: BrowserToolSchema = {
    name: 'screenshot',
    description:
        'Look at a small picture of the screen. LAST RESORT ONLY - the page state is usually enough. Use it to double-check something the page state cannot confirm (e.g. that your post or message really is in the editor or was published), or when you are stuck. Limited uses per session.',
    parameters: schema(),
};

export const BROWSER_TOOL_NAMES = new Set([...BROWSER_TOOLS.map((t) => t.name), SCREENSHOT_TOOL.name]);

/** OpenAI-shaped tool definitions for the provider */
export function toolDefinitions(tools: BrowserToolSchema[]) {
    return tools.map((tool) => ({ type: 'function' as const, function: tool }));
}

export function systemPrompt({ maxSteps, screenshots = 0 }: { maxSteps: number; screenshots?: number }) {
    return `You are a browser agent. You control a real web browser on the user's phone to complete ONE task for the user, then call done.

After every action you get the current page state:
- [n] lines are interactive elements. Use n with click, type and select_option.
- [Tn] lines are text on the page. Use read_page to read long text in full.
Only the latest page state is shown and ids change after every action, so always use ids from the latest state.
The browser has a phone-sized screen, so sites may show their mobile layout (menus behind a button, fewer columns).

Rules:
- One action at a time. Use as few steps as possible. Navigate straight to a URL when you can, e.g. https://www.google.com/search?q=your+query
- If a cookie banner or popup is in the way, dismiss it.
- Do not buy, book, pay, send messages, post, or submit anything with real-world effects unless the task explicitly asks for it. When in doubt, ask_user first.
- Do not invent search values the task did not give you (like a departure city). Leave optional fields empty, or ask_user if one is required.
- If you need a decision only the user can make, call ask_user.
- Never make up information. Only report what you saw on pages.
- Pages you leave disappear from view. When you see something you need for the answer (a price, a name, a link), save it in the note field of your next action. Your notes are always shown.
- Check your work. If an action's result says "Failed" or "nothing on the page changed", it did not happen - try another way. Before saying something was posted, sent, saved or submitted, confirm it in the page state.
- Results tell you what the page sent to the site ("Sent to the site: ... -> 200 OK"). After you submit something, that line means it went through - NEVER post or send it again; call done. "Nothing was sent to the site" or "(failed)" means it did not go through.

Sign-in pages, captchas and verification codes are a HARD STOP:
- If the content you need is behind a sign-in, a captcha / "are you human" check, or a verification code, call ask_user immediately and do nothing else on that page. Ask the user to handle it themselves in the browser - they will take over, do it, and reply.
- NEVER ask the user to send you a password, username or code in the chat.
- Never guess usernames, passwords or codes. Never try to solve a captcha. Never look for a way around it (other sites, guest links, different URLs, retrying).
- Only type credentials or codes the user gave you for this task.
- A page can show a sign-in form or button and still have the content you need. If the content is there, use it and ignore the form.

Other rules:
- Files cannot be downloaded or uploaded.
- You have at most ${maxSteps} steps.
- When finished, call done with the complete answer: the concrete facts, prices, names and links the user asked for.${screenshots
            ? `\n\nScreenshots: you can call screenshot at most ${screenshots} times. It is a last resort for double-checking, not a way to look around - never use it every step or twice in a row. Use the page state first.`
            : ''
        }

Today is ${new Date().toDateString()}.`;
}

/** What the user sees for a step - no ids, no jargon. Translated, since it is shown in the chat card and history. */
export function stepLabel(tool: string, args: Record<string, any> = {}, result: { target?: string; sensitive?: boolean } = {}) {
    const t = (key: string, options?: Record<string, any>) => i18n.t(`browser_use.steps.${key}`, options);
    const target = result.target ? `“${clip(result.target, 50)}”` : '';
    switch (tool) {
        case 'navigate':
            return t('opening', { site: hostOf(args.url) || args.url });
        case 'click':
            return target ? t('clicking', { target }) : t('clicking_page');
        case 'type':
            if (result.sensitive) return target ? t('entering_password_into', { target }) : t('entering_password');
            return target ? t('typing_into', { text: `“${clip(args.text, 40)}”`, target }) : t('typing', { text: `“${clip(args.text, 40)}”` });
        case 'select_option':
            return t('choosing', { option: target || `“${clip(args.option, 40)}”` });
        case 'press_key':
            return t('pressing', { key: args.key });
        case 'scroll':
            return args.direction === 'up' ? t('scrolling_up') : t('scrolling_down');
        case 'go_back':
            return t('going_back');
        case 'read_page':
            return t('reading');
        case 'screenshot':
            return t('screenshot');
        case 'wait':
            return t('waiting');
        case 'ask_user':
            return t('asking');
        case 'checkpoint':
            if (args.verdict === 'FINISH') return t('checkpoint_finish');
            if (args.verdict === 'BACK') return t('checkpoint_back', { title: `“${clip(args.title, 40)}”` });
            if (args.verdict === 'GIVE_UP') return t('checkpoint_give_up');
            return t('checkpoint_on_track');
        case 'done':
            return t('finished');
        default:
            return t('using', { tool });
    }
}

export function clip(text: any = '', max = 40) {
    const flat = String(text ?? '')
        .replace(/\s+/g, ' ')
        .trim();
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function hostOf(url: any) {
    try {
        return new URL(/^https?:\/\//i.test(String(url)) ? String(url) : `https://${url}`).host;
    } catch {
        return null;
    }
}
