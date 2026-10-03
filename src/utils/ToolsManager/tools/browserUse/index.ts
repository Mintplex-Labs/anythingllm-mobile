import { type IStreamEvent } from "@/utils/AiProviders/baseOpenAILikeProvider";
import { type ToolExecutionContext } from "@/utils/ToolsManager";
import uiStore from "@/store/UIStore";
import BrowserUse from "@/utils/BrowserUse";
import BrowserAgent, { type BrowserSessionSnapshot } from "@/utils/BrowserUse/agent";
import BackgroundWork from "@/utils/BackgroundWork";
import { clip } from "@/utils/BrowserUse/tools";
import { hasNativeBrowser } from "@/utils/BrowserUse/native";
import { parseToolArgs } from "../createFiles/shared";
import i18n from "@/i18n";

/**
 * Browser Use - hands a task to a browser sub-agent that operates a real WebView on the phone,
 * signed in to the user's own accounts, and streams the session into the chat as a live card
 * (see BrowserUseSessionCard). The mobile port of the desktop browser-use skill
 * (server/utils/agents/aibitat/plugins/browser-use).
 *
 * Cloud / external models only - the sub-agent makes dozens of model calls with large page
 * states, which the on-device model cannot do. Only offered in the main app (not the assistant
 * overlay or quick actions, which have no room for a browser) and never to scheduled jobs: it
 * needs a person who can sign in, solve a captcha or stop it.
 */

/** Cloud providers do not report their context window - assume a modest one (page states are capped at ~6k chars anyway) */
const ASSUMED_CONTEXT_TOKENS = 32_000;

export default {
    id: 'browserUse',
    get name() { return i18n.t('tools.browser_use.name'); },
    get description() { return i18n.t('tools.browser_use.description'); },
    defaultEnabled: false,
    category: 'default',
    supportsOnDevice: false,
    hiddenFromScheduledJobs: true,
    /** The native browser lives in the main activity only */
    isAvailable: async () => hasNativeBrowser && (await BrowserUse.getCapabilities(true)).available,
    definition: {
        type: 'function',
        function: {
            name: 'browser_use',
            description: 'Operate a real web browser on the user\'s phone, signed in to the user\'s own accounts. With this tool you CAN see the user\'s feeds, inboxes and accounts, so never say you cannot access them. ALWAYS use it for the user\'s own things on a website ("my feed", "my timeline", "my inbox", "my notifications", "my orders"), for sites that need a real browser (X/Twitter, LinkedIn, Instagram, Facebook, Reddit, web apps), and for anything needing clicks, scrolling, forms or comparing pages. Not for grabbing the content of a single URL (use web_scraper) or looking things up (use web search).',
            parameters: {
                type: 'object',
                properties: {
                    task: {
                        type: 'string',
                        description: 'The full task: what to do in the browser and what to bring back.',
                    },
                    start_url: {
                        type: 'string',
                        description: 'Address to start from when known, e.g. https://x.com/home',
                    },
                    profile: {
                        type: 'string',
                        description: 'Optional browser profile name. Only if the user names one.',
                    },
                },
                required: ['task'],
            },
        },
    },
    config: {},
    execute: async function (args: unknown, streamEmitter: (event: IStreamEvent, data: any) => void, context: ToolExecutionContext = {}): Promise<string> {
        const { task, start_url, profile } = parseToolArgs<{ task: string; start_url: string | null; profile: string | null }>(args, { task: '', start_url: null, profile: null });
        if (!task?.trim()) return 'No task was given to the browser agent.';
        if (!context.llm) return 'The browser agent only works with a cloud or external model. Tell the user to switch models to use it.';
        if (!(await this.isAvailable().catch(() => false))) return 'The browser agent is only available in the main AnythingLLM app. Tell the user to open the app to use it.';

        const preferences = await uiStore.getFromStorage('llmPreference', { provider: 'unknown', config: {} as { model?: string } });
        const agent = new BrowserAgent({
            llm: context.llm,
            task: task.trim(),
            profile: profile || null,
            startUrl: start_url || null,
            workspace: null,
            model: preferences?.config?.model ?? null,
            contextLimit: ASSUMED_CONTEXT_TOKENS,
            // Images go in a follow-up user message; a model that rejects them gets screenshots switched off.
            vision: true,
            onUpdate: (snapshot) => {
                streamEmitter('report_browser_session', snapshot);
                notification.show(snapshot);
            },
        });
        // Keeps the session running while the user is in another app, with its current step in the notification.
        const notification = sessionNotification(agent.id, task);

        // Stopping the chat reply stops the session too.
        const onAbort = () => agent.stop('aborted');
        context.signal?.addEventListener('abort', onAbort, { once: true });
        BrowserUse.register(agent);
        await BackgroundWork.begin(agent.id, notification.textFor(null));
        try {
            streamEmitter('report_status', i18n.t('tools.browser_use.status_starting'));
            return await agent.run();
        } finally {
            context.signal?.removeEventListener('abort', onAbort);
            BrowserUse.unregister(agent);
            await BackgroundWork.end(agent.id);
        }
    },
} as const;

/** The foreground service notification for a session: what the agent is doing right now, or what it needs. */
function sessionNotification(sessionId: string, task: string) {
    let shown = '';
    const textFor = (snapshot: BrowserSessionSnapshot | null) => {
        if (snapshot?.status === 'needs-help' && snapshot.question)
            return { title: i18n.t('browser_use.notification.needs_help_title'), body: clip(snapshot.question, 240) };
        return {
            title: i18n.t('browser_use.notification.title'),
            body: snapshot?.step?.label || clip(task, 240),
        };
    };
    return {
        textFor,
        /** Only touches the notification when its text changes - token updates arrive far more often than steps. */
        show(snapshot: BrowserSessionSnapshot) {
            if (snapshot.endedAt) return;
            const text = textFor(snapshot);
            const key = `${text.title}\n${text.body}`;
            if (key === shown) return;
            shown = key;
            BackgroundWork.update(sessionId, text);
        },
    };
}
