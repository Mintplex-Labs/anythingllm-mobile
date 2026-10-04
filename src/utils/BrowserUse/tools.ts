/**
 * The tools the browser sub-agent can call - a port of the desktop
 * server/utils/agents/aibitat/plugins/browser-use/tools.js. Descriptions are intentionally short:
 * the schemas are re-sent on every step.
 */

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

/** Actions executed by the browser (see ./session). */
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
 * Only offered to models that accept images, and rationed by the agent loop (see agent/guards.ts):
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
