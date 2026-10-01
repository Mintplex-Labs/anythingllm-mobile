import uiStore from "@/store/UIStore";

/**
 * Tools the user chose to "always approve" from the approval card. Keyed by the tool's function
 * name (the `skillName` the approval request carries). Stored on-device only - Settings > Utility >
 * Tool auto-approvals lists them so they can be removed and asked about again.
 */
export type ToolAutoApproval = {
    skillName: string;
    /** When the user ticked "always approve" */
    approvedAt: number;
}

type StoredAutoApprovals = Record<string, { approvedAt: number }>;

const STORAGE_KEY = 'tool_auto_approvals' as const;

async function read(): Promise<StoredAutoApprovals> {
    const stored = await uiStore.getFromStorage<StoredAutoApprovals>(STORAGE_KEY, {});
    return stored && typeof stored === 'object' ? stored : {};
}

/** Every auto-approved tool, most recently added first */
export async function listAutoApprovals(): Promise<ToolAutoApproval[]> {
    const stored = await read();
    return Object.entries(stored)
        .map(([skillName, entry]) => ({ skillName, approvedAt: entry?.approvedAt ?? 0 }))
        .sort((a, b) => b.approvedAt - a.approvedAt);
}

export async function isAutoApproved(skillName: string): Promise<boolean> {
    const stored = await read();
    return Object.prototype.hasOwnProperty.call(stored, skillName);
}

export async function addAutoApproval(skillName: string): Promise<void> {
    const stored = await read();
    stored[skillName] = { approvedAt: Date.now() };
    await uiStore.setToStorage(STORAGE_KEY, stored);
}

/** The user will be asked again the next time this tool needs approval */
export async function removeAutoApproval(skillName: string): Promise<void> {
    const stored = await read();
    if (!Object.prototype.hasOwnProperty.call(stored, skillName)) return;
    delete stored[skillName];
    await uiStore.setToStorage(STORAGE_KEY, stored);
}
