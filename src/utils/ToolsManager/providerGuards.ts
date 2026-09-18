import uiStore from "@/store/UIStore";

/**
 * Which tools a provider can run. Kept apart from the ToolsManager so individual tools can
 * import it without a circular dependency (ToolsManager -> tools -> ToolsManager).
 */

/** The `llmPreference.provider` value of the on-device (llama.rn) provider */
export const ON_DEVICE_PROVIDER = 'native';

export function isOnDeviceProviderName(provider?: string | null): boolean {
    return provider === ON_DEVICE_PROVIDER;
}

/** Whether the user currently chats with the on-device provider */
export async function isOnDeviceProvider(): Promise<boolean> {
    const preferences = await uiStore.getFromStorage('llmPreference', { provider: 'unknown', config: {} });
    return isOnDeviceProviderName(preferences?.provider);
}

/**
 * Whether a tool may be offered to the model for a provider. Tools flagged
 * `supportsOnDevice: false` (eg: presentation building, which needs several large structured
 * completions) are pruned for the on-device provider and shown disabled in the tools sheet.
 */
export function toolSupportsProvider(tool: { supportsOnDevice?: boolean }, provider?: string | null): boolean {
    if (!isOnDeviceProviderName(provider)) return true;
    return tool.supportsOnDevice !== false;
}
