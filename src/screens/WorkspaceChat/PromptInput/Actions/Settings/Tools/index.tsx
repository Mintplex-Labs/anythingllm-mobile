import { useEffect, useRef, useState } from "react";
import { CaretRight, Wrench } from "phosphor-react-native";
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useBottomSheet, BOTTOM_SHEET_NAMES } from '@/contexts/BottomSheetContext';
import { View, Text, TouchableOpacity } from "react-native";
import ToggleSwitch from "@/components/ToggleSwitch";
import { SheetHeader, MUTED_TEXT } from "@/components/SheetMenu";
import uiStore from "@/store/UIStore";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useLLMPreference from "@/hooks/useLLMPreference";
import ToolsManager, { TOOL_GROUPS, toolSupportsProvider, type ToolGroupId, type ToolManagerTool } from "@/utils/ToolsManager";

type ToolsPage = 'menu' | ToolGroupId;

/**
 * Per-tool on/off switches. Ungrouped tools toggle right on the main page; grouped tools (eg:
 * the create-files skills) sit behind a row that opens a sub-page with a back caret, the same
 * multi-page pattern the thread menu uses for exports.
 *
 * Tools the current provider cannot run (`supportsOnDevice: false` while the on-device model is
 * selected) are shown greyed out and cannot be switched on. `ToolsManager.getTools` prunes them
 * from the model's tool list as well, so an earlier "on" setting is harmless.
 */
export default function ToolsActionSheet() {
    const insets = useSafeAreaInsets();
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const { registerSheet, presentSheet, isSheetActive } = useBottomSheet();
    const { llmPreferences } = useLLMPreference();
    const [page, setPage] = useState<ToolsPage>('menu');
    const [toolSettings, setToolSettings] = useState<Record<string, boolean>>({});

    const isToolAvailable = (tool: ToolManagerTool) => toolSupportsProvider(tool, llmPreferences?.provider);
    const isToolOn = (tool: ToolManagerTool) => !!toolSettings[tool.id] && isToolAvailable(tool);

    const handleToggle = async (tool: ToolManagerTool) => {
        if (!isToolAvailable(tool)) return;
        const newToolSettings = { ...toolSettings, [tool.id]: !toolSettings[tool.id] };
        setToolSettings(newToolSettings);
        await uiStore.setToStorage('tools', newToolSettings);
        ToolsManager.resetTools();
        await loadTools();
    };

    const loadTools = async () => {
        const updates: Record<string, boolean> = {};
        for (const tool of ToolsManager.configurableTools) updates[tool.id] = tool.defaultEnabled;
        const storedToolSettings: Record<string, boolean> = await uiStore.getFromStorage('tools', {});
        for (const [tool, enabled] of Object.entries(storedToolSettings)) updates[tool] = enabled;
        setToolSettings(updates);
    }

    useEffect(() => {
        registerSheet(BOTTOM_SHEET_NAMES.TOOLS, bottomSheetRef);
    }, [registerSheet]);

    useEffect(() => {
        loadTools();
    }, []);

    const handleDismiss = () => {
        setPage('menu');
        if (isSheetActive(BOTTOM_SHEET_NAMES.TOOLS)) presentSheet(BOTTOM_SHEET_NAMES.PRIMARY_PROMPT_INPUT, true);
    };

    const ungroupedDefaultTools = ToolsManager.configurableTools.filter(tool => tool.category === 'default' && !tool.group);
    const appConnectionTools = ToolsManager.configurableTools.filter(tool => tool.category === 'appConnections');
    const groupTools = (groupId: ToolGroupId) => ToolsManager.configurableTools.filter(tool => tool.group === groupId);

    return (
        <BottomSheetModal
            ref={bottomSheetRef}
            index={0}
            snapPoints={['50%', '90%']}
            enableDynamicSizing={false}
            enablePanDownToClose={true}
            backgroundStyle={{ backgroundColor: '#1B1B1E' }}
            handleIndicatorStyle={{ backgroundColor: '#9F9FA0', width: 45, margin: 10 }}
            onDismiss={handleDismiss}
        >
            <BottomSheetScrollView contentContainerStyle={{ paddingHorizontal: 30, paddingBottom: insets.bottom + 100 }}>
                {page === 'menu' ? (
                    <>
                        <View style={{ marginBottom: 24 }} className='flex w-full flex-row items-center justify-center'>
                            <Text className='text-white text-lg font-medium'>Tools</Text>
                        </View>
                        <View style={{ gap: 16 }} className='flex flex-col items-start justify-between'>
                            {ungroupedDefaultTools.map(tool => (
                                <TogglableItem key={tool.id} primary title={tool.name} description={tool.description} isOn={isToolOn(tool)} onToggle={() => handleToggle(tool)} />
                            ))}
                            {(Object.keys(TOOL_GROUPS) as ToolGroupId[]).map(groupId => {
                                const tools = groupTools(groupId);
                                const enabledCount = tools.filter(isToolOn).length;
                                return (
                                    <ToolGroupRow
                                        key={groupId}
                                        title={TOOL_GROUPS[groupId].name}
                                        description={TOOL_GROUPS[groupId].description}
                                        status={enabledCount === 0 ? 'Off' : `${enabledCount} of ${tools.length} on`}
                                        onPress={() => setPage(groupId)}
                                    />
                                );
                            })}
                            <View style={{ gap: 12 }} className='flex w-full flex-col items-start justify-between'>
                                <Text className='text-white font-semibold'>App Connections</Text>
                                {appConnectionTools.map(tool => (
                                    <TogglableItem key={tool.id} title={tool.name} description={tool.description} isOn={isToolOn(tool)} onToggle={() => handleToggle(tool)} />
                                ))}
                            </View>
                        </View>
                    </>
                ) : (
                    <ToolGroupPage
                        groupId={page}
                        tools={groupTools(page)}
                        isOn={isToolOn}
                        isAvailable={isToolAvailable}
                        onToggle={handleToggle}
                        onBack={() => setPage('menu')}
                    />
                )}
            </BottomSheetScrollView>
        </BottomSheetModal>
    );
}

/** Sub-page listing every tool in a group with its own switch */
function ToolGroupPage({
    groupId,
    tools,
    isOn,
    isAvailable,
    onToggle,
    onBack,
}: {
    groupId: ToolGroupId;
    tools: ToolManagerTool[];
    isOn: (tool: ToolManagerTool) => boolean;
    isAvailable: (tool: ToolManagerTool) => boolean;
    onToggle: (tool: ToolManagerTool) => void;
    onBack: () => void;
}) {
    const group = TOOL_GROUPS[groupId];
    const unavailableCount = tools.filter(tool => !isAvailable(tool)).length;
    return (
        <View>
            <SheetHeader title={group.name} onBack={onBack} />
            <Text style={{ color: MUTED_TEXT, marginBottom: 20 }} className='text-sm'>
                {group.description} Files are kept on this device until you clear temporary files in settings.
            </Text>
            <View style={{ gap: 16 }} className='flex flex-col items-start justify-between'>
                {tools.map(tool => {
                    const available = isAvailable(tool);
                    return (
                        <TogglableItem
                            key={tool.id}
                            primary
                            title={tool.name}
                            description={available ? tool.description : `${tool.description} Needs a cloud model.`}
                            isOn={isOn(tool)}
                            disabled={!available}
                            onToggle={() => onToggle(tool)}
                        />
                    );
                })}
            </View>
            {unavailableCount > 0 && (
                <Text style={{ color: MUTED_TEXT, marginTop: 20 }} className='text-xs'>
                    Greyed out tools are not available with the on-device model. Switch to a cloud provider to use them.
                </Text>
            )}
        </View>
    );
}

/** Main-page row that opens a group's sub-page */
function ToolGroupRow({ title, description, status, onPress }: { title: string; description: string; status: string; onPress: () => void }) {
    return (
        <TouchableOpacity onPress={onPress} className='flex w-full flex-row items-center' accessibilityRole="button" accessibilityLabel={`${title}, ${status}`}>
            <View className='flex-1 flex flex-col' style={{ paddingRight: 12 }}>
                <Text style={{ color: '#FFF' }} className='text-[14px] font-semibold'>{title}</Text>
                <Text style={{ color: MUTED_TEXT, maxWidth: '90%' }} className='text-sm'>{description}</Text>
            </View>
            <View style={{ gap: 4 }} className='flex flex-row items-center'>
                <Text style={{ color: MUTED_TEXT }} className='text-sm'>{status}</Text>
                <CaretRight size={18} color={MUTED_TEXT} />
            </View>
        </TouchableOpacity>
    );
}

function TogglableItem({ title, description, isOn, onToggle, primary = false, disabled = false }: { title: string, description: string, isOn: boolean, onToggle: () => void, primary?: boolean, disabled?: boolean }) {
    return (
        <View className='flex w-full flex-row items-center justify-between' style={{ opacity: disabled ? 0.45 : 1 }}>
            <View className='flex flex-col items-start justify-between' style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ color: !primary && !isOn ? '#9F9FA0' : '#FFF' }} className={`text-[14px] font-semibold`}>{title}</Text>
                <Text style={{ color: '#9F9FA0', maxWidth: '90%' }} className='text-sm'>{description}</Text>
            </View>
            {disabled
                ? <View pointerEvents="none"><ToggleSwitch isOn={false} onToggle={() => {}} /></View>
                : <ToggleSwitch isOn={isOn} onToggle={onToggle} />}
        </View>
    );
}

export function ToolsActionButton({ disabled = false }: { disabled: boolean }) {
    const { presentSheet } = useBottomSheet();
    return (
        <TouchableOpacity
            disabled={disabled}
            onPress={() => presentSheet(BOTTOM_SHEET_NAMES.TOOLS)}
            style={{ gap: 11, opacity: disabled ? 0.4 : 1 }}
            className='flex flex-col items-center justify-center'
        >
            <View style={{ backgroundColor: '#3f3f42', width: 52, height: 52 }} className='flex flex-col items-center justify-center rounded-full'>
                <Wrench size={32} color="#FFF" />
            </View>
            <Text className='text-white text-lg font-medium'>Tools</Text>
        </TouchableOpacity>

    );
}
