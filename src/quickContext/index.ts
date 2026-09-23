import { NativeModules, Platform } from 'react-native';
import truncate from 'truncate';
import Workspace, { type WorkspaceType } from '@/database/models/Workspace';
import WorkspaceThread, { type WorkspaceThreadType } from '@/database/models/WorkspaceThread';
import uiStore from '@/store/UIStore';
import { PATHS } from '@/utils/paths';
import { generateUUID } from '@/utils/constants';
import { resetToWhenReady } from '@/utils/navigationRef';
import { QUICK_CONTEXT_SYSTEM_PROMPT, type QuickMode } from './actions';

/**
 * Quick Actions: highlight text in any app, tap "Ask with AnythingLLM" in the selection toolbar and
 * work on it in a card over that app (Android, see quickcontext/QuickContextActivity.kt). Edit mode
 * rewrites the text to copy and paste over the still-selected original; Summarize mode explains,
 * summarizes or researches it.
 *
 * The two modes keep their history differently:
 *  - Edit sessions are ephemeral. A rewrite is pasted and forgotten, so the card chats through an
 *    in-memory workspace and thread that never touch the database (the chat handler's `ephemeral`
 *    flag) and nothing shows up in the app.
 *  - Summarize sessions are real threads in the "Quick Actions" workspace: a summary or a piece of
 *    research is worth keeping and continuing later, so they appear in the sidebar and can be opened
 *    in the main app like any other thread.
 * The card and the main app run in the same JS runtime and share the loaded on-device model.
 */

export const QUICK_CONTEXTS_WORKSPACE = {
    name: 'Quick Actions',
    slug: 'quick-actions',
} as const;

/** Thread names are `<Action> · <start of the selection>` - keep them scannable in the sidebar. */
const THREAD_NAME_SELECTION_CHARS = 48;

export type QuickContextSession = {
    workspace: WorkspaceType;
    thread: WorkspaceThreadType;
    /** True when nothing about this session is stored (Edit mode). */
    ephemeral: boolean;
};

const { QuickContextModule } = NativeModules;

function log(message: string, ...args: any[]) {
    console.log(`\x1b[36m[QuickContext]\x1b[0m ${message}`, ...args);
}

/** Tell the sidebar in the main app (if it is mounted behind the card) to refetch its workspaces. */
function notifyWorkspacesChanged() {
    uiStore.emitter.emit('reloadWorkspaces');
}

/** Whether sessions in this mode are kept - see the module comment. */
export function isPersistentMode(mode: QuickMode): boolean {
    return mode === 'summarize';
}

/**
 * An Edit session: plain objects, not database rows. The workspace carries the settings the
 * providers read (system prompt, temperature, context length); the thread slug is unique so
 * per-thread provider state can never collide with a real thread.
 */
export function createEphemeralSession(): QuickContextSession {
    const unreachable = async () => false;
    const workspace: WorkspaceType = {
        name: QUICK_CONTEXTS_WORKSPACE.name,
        slug: QUICK_CONTEXTS_WORKSPACE.slug,
        createdAt: Date.now(),
        systemPrompt: QUICK_CONTEXT_SYSTEM_PROMPT,
        temperature: Workspace.defaultTemperature,
        contextLength: Workspace.defaultContextLength,
        isRemote: false,
        remoteConfig: null as unknown as WorkspaceType['remoteConfig'],
        remoteServerReachable: unreachable,
        remoteModelTag: async () => '',
    };
    const thread: WorkspaceThreadType = {
        // Not the default thread name, so the chat handler's auto-rename never considers it.
        name: QUICK_CONTEXTS_WORKSPACE.name,
        workspaceSlug: workspace.slug,
        slug: `quick-action-${generateUUID()}`,
        createdAt: Date.now(),
        isRemote: false,
        remoteConfig: null as unknown as WorkspaceThreadType['remoteConfig'],
        remoteServerReachable: unreachable,
    };
    return { workspace, thread, ephemeral: true };
}

/** The "Quick Actions" workspace, created on first use with a system prompt covering both modes. */
async function ensureQuickContextsWorkspace(): Promise<{ workspace: WorkspaceType; createdThread: WorkspaceThreadType | null }> {
    const existing = await Workspace.first([{ field: 'slug', value: QUICK_CONTEXTS_WORKSPACE.slug }]);
    if (existing) return { workspace: existing, createdThread: null };

    const created = await Workspace.create({ name: QUICK_CONTEXTS_WORKSPACE.name });
    // The user can still tune this from the workspace settings like any other workspace.
    const updated = await Workspace.update([{ field: 'slug', value: created.slug }], { systemPrompt: QUICK_CONTEXT_SYSTEM_PROMPT });
    const workspace = updated ?? created;
    log('Created the Quick Actions workspace', workspace.slug);
    notifyWorkspacesChanged();
    // Workspace.create makes a first thread - use it for this session rather than leaving it empty.
    return { workspace, createdThread: created.threads?.[0] ?? null };
}

/** A Summarize session: a fresh thread in the Quick Actions workspace. */
export async function createPersistentSession(): Promise<QuickContextSession> {
    const { workspace, createdThread } = await ensureQuickContextsWorkspace();
    const thread = createdThread ?? await WorkspaceThread.create({ workspaceSlug: workspace.slug });
    if (!createdThread) notifyWorkspacesChanged();
    log('Started persistent session', { workspace: workspace.slug, thread: thread.slug });
    return { workspace, thread, ephemeral: false };
}

/**
 * Name a persistent thread after what the user did with the selection, before the first prompt goes
 * out (the chat handler's auto-rename only fires for threads still called "New Thread").
 */
export async function nameQuickContextThread(session: QuickContextSession, actionLabel: string, selectedText: string): Promise<void> {
    if (session.ephemeral) return;
    const snippet = truncate(selectedText.replace(/\s+/g, ' ').trim(), THREAD_NAME_SELECTION_CHARS);
    const name = snippet ? `${actionLabel} · ${snippet}` : actionLabel;
    const updated = await WorkspaceThread.update(
        [{ field: 'workspace_slug', value: session.workspace.slug }, { field: 'slug', value: session.thread.slug }],
        { name },
    );
    if (!updated) return;
    uiStore.emitter.emit('workspaceUpdate', {
        type: 'rename-thread',
        details: { workspaceSlug: session.workspace.slug, threadSlug: session.thread.slug, newName: name },
    });
}

/** Drop a persistent session nothing was saved to, so empty threads never pile up in the sidebar. */
export async function discardEmptyQuickContextThread(session: QuickContextSession): Promise<void> {
    if (session.ephemeral) return;
    await WorkspaceThread.delete([{ field: 'workspace_slug', value: session.workspace.slug }, { field: 'slug', value: session.thread.slug }]);
    notifyWorkspacesChanged();
    log('Discarded empty session thread', session.thread.slug);
}

/** Whether this platform has the toolbar entry at all (Android only - iOS has no equivalent hook). */
export function isQuickContextAvailable(): boolean {
    return Platform.OS === 'android' && !!QuickContextModule;
}

/**
 * Whether "Ask with AnythingLLM" is currently offered in other apps' selection toolbars. On by default;
 * the user can turn it off under Settings > Special tools > Context awareness.
 */
export async function isQuickContextEnabled(): Promise<boolean> {
    if (!isQuickContextAvailable()) return false;
    return QuickContextModule.isEnabled();
}

/** Show or hide the toolbar entry everywhere - applied by the system straight away. */
export async function setQuickContextEnabled(enabled: boolean): Promise<void> {
    if (!isQuickContextAvailable()) return;
    await QuickContextModule.setEnabled(enabled);
    log(enabled ? 'Toolbar entry enabled' : 'Toolbar entry disabled');
}

/** Bring the main app forward (eg: to finish onboarding) and close the card. */
export function openMainApp(): void {
    QuickContextModule?.openInApp();
}

/** Close the card and return to the app the text was selected in. */
export function closeQuickContext(): void {
    QuickContextModule?.finish();
}

/**
 * Continue a persistent session in the main app: queue the navigation to its thread (applied as soon
 * as the main navigator is ready - now if the app is running, after launch otherwise) and bring the
 * main app forward.
 */
export function openQuickContextInApp(session: QuickContextSession): void {
    if (session.ephemeral) return;
    resetToWhenReady(PATHS.workspace_chat, { wsSlug: session.workspace.slug, threadSlug: session.thread.slug });
    QuickContextModule?.openInApp();
}
