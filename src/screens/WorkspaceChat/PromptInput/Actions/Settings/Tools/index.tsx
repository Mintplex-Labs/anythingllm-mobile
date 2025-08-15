import { useEffect, useRef, useState } from "react";
import { Wrench } from "phosphor-react-native";
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useBottomSheet, BOTTOM_SHEET_NAMES } from '@/contexts/BottomSheetContext';
import { View, Text, TouchableOpacity } from "react-native";
import ToggleSwitch from "@/components/ToggleSwitch";
import uiStore from "@/store/UIStore";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScrollView } from "react-native-gesture-handler";
import ToolsManager from "@/utils/ToolsManager";

export default function ToolsActionSheet() {
    const insets = useSafeAreaInsets();
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const { registerSheet, presentSheet } = useBottomSheet();
    const [toolSettings, setToolSettings] = useState<Record<string, boolean>>({});
    const handleToggle = async (tool: keyof typeof toolSettings) => {
        const newToolSettings = { ...toolSettings, [tool]: !toolSettings[tool] };
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

    return (
        <BottomSheetModal
            ref={bottomSheetRef}
            index={0}
            snapPoints={['50%', '90%']}
            enableDynamicSizing={false}
            enablePanDownToClose={true}
            backgroundStyle={{ backgroundColor: '#1B1B1E' }}
            handleIndicatorStyle={{ backgroundColor: '#9F9FA0', width: 45, margin: 10 }}
            onDismiss={() => presentSheet(BOTTOM_SHEET_NAMES.PRIMARY_PROMPT_INPUT, true)}
        >
            <ScrollView contentContainerStyle={{ paddingHorizontal: 30, paddingBottom: insets.bottom + 100 }}>
                <View style={{ marginBottom: 24 }} className='flex w-full flex-row items-center justify-center'>
                    <Text className='text-white text-lg font-medium'>Tools</Text>
                </View>
                <View style={{ gap: 16 }} className='flex flex-col items-start justify-between'>
                    {ToolsManager.configurableTools.filter(tool => tool.category === 'default').map(tool => (
                        <TogglableItem key={tool.id} primary title={tool.name} description={tool.description} isOn={toolSettings[tool.id]} onToggle={handleToggle.bind(null, tool.id)} />
                    ))}
                    <View style={{ gap: 12 }} className='flex w-full flex-col items-start justify-between'>
                        <Text className='text-white font-semibold'>App Connections</Text>
                        {ToolsManager.configurableTools.filter(tool => tool.category === 'appConnections').map(tool => (
                            <TogglableItem key={tool.id} title={tool.name} description={tool.description} isOn={toolSettings[tool.id]} onToggle={handleToggle.bind(null, tool.id)} />
                        ))}
                    </View>
                </View>
            </ScrollView>
        </BottomSheetModal>
    );
}


function TogglableItem({ title, description, isOn, onToggle, primary = false }: { title: string, description: string, isOn: boolean, onToggle: () => void, primary?: boolean }) {
    return (
        <View className='flex w-full flex-row items-center justify-between'>
            <View className='flex flex-col items-start justify-between'>
                <Text style={{ color: !primary && !isOn ? '#9F9FA0' : '#FFF' }} className={`text-[14px] font-semibold`}>{title}</Text>
                <Text style={{ color: '#9F9FA0', maxWidth: '90%' }} className='text-sm'>{description}</Text>
            </View>
            <ToggleSwitch isOn={isOn} onToggle={onToggle} />
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