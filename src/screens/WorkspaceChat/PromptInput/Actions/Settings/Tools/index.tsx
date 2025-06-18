import { useEffect, useRef, useState } from "react";
import { Wrench } from "phosphor-react-native";
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useBottomSheet, BOTTOM_SHEET_NAMES } from '@/contexts/BottomSheetContext';
import { View, Text, TouchableOpacity } from "react-native";
import ToggleSwitch from "@/components/ToggleSwitch";
import uiStore from "@/store/UIStore";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScrollView } from "react-native-gesture-handler";

export default function ToolsActionSheet() {
    const insets = useSafeAreaInsets();
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const { registerSheet, presentSheet } = useBottomSheet();
    const [toolSettings, setToolSettings] = useState({
        webSearch: false,
        draftEmail: false,
        draftText: false,
        calendarEventCreation: false,
    });
    const handleToggle = (tool: keyof typeof toolSettings) => {
        const newToolSettings = { ...toolSettings, [tool]: !toolSettings[tool] };
        setToolSettings(newToolSettings);
        uiStore.setToStorage('tools', newToolSettings);
    };

    useEffect(() => {
        registerSheet(BOTTOM_SHEET_NAMES.TOOLS, bottomSheetRef);
        uiStore.getFromStorage('tools', toolSettings).then((storedToolSettings) => setToolSettings(prev => ({ ...prev, ...storedToolSettings })));
    }, [registerSheet]);

    return (
        <BottomSheetModal
            ref={bottomSheetRef}
            index={0}
            snapPoints={['50%']}
            enableDynamicSizing={false}
            enablePanDownToClose={true}
            backgroundStyle={{ backgroundColor: '#1B1B1E' }}
            handleIndicatorStyle={{ backgroundColor: '#9F9FA0', width: 45, margin: 10 }}
            onDismiss={() => presentSheet(BOTTOM_SHEET_NAMES.PRIMARY_PROMPT_INPUT, true)}
        >
            <ScrollView style={{ paddingHorizontal: 30, paddingBottom: insets.bottom }}>
                <View style={{ marginBottom: 24 }} className='flex w-full flex-row items-center justify-center'>
                    <Text className='text-white text-lg font-medium'>Tools</Text>
                </View>
                <View style={{ gap: 16 }} className='flex flex-col items-start justify-between'>
                    <TogglableItem primary title="Web Search" description="Real-time web search during chat" isOn={toolSettings.webSearch} onToggle={() => handleToggle('webSearch')} />
                    <View style={{ gap: 12 }} className='flex w-full flex-col items-start justify-between'>
                        <Text className='text-white text-[14px] font-semibold'>App Connections</Text>
                        <TogglableItem title="Calendar Event Creation" description="Create calendar events dynamically" isOn={toolSettings.calendarEventCreation} onToggle={() => handleToggle('calendarEventCreation')} />
                        <TogglableItem title="Email Drafting" description="Generate draft emails" isOn={toolSettings.draftEmail} onToggle={() => handleToggle('draftEmail')} />
                        <TogglableItem title="Draft Text Message" description="Generate draft text messages" isOn={toolSettings.draftText} onToggle={() => handleToggle('draftText')} />
                    </View>
                </View>

            </ScrollView>
        </BottomSheetModal>
    );
}

export function ToolsActionIcon() {
    const { presentSheet } = useBottomSheet();
    return (
        <TouchableOpacity onPress={() => presentSheet(BOTTOM_SHEET_NAMES.TOOLS)} style={{ gap: 11 }} className='flex flex-col items-center justify-center'>
            <View style={{ backgroundColor: '#3f3f42', width: 52, height: 52 }} className='flex flex-col items-center justify-center rounded-full'>
                <Wrench size={32} color="#FFF" />
            </View>
            <Text className='text-white text-lg font-medium'>Tools</Text>
        </TouchableOpacity>

    );
}

function TogglableItem({ title, description, isOn, onToggle, primary = false }: { title: string, description: string, isOn: boolean, onToggle: () => void, primary?: boolean }) {
    return (
        <View className='flex w-full flex-row items-center justify-between'>
            <View className='flex flex-col items-start justify-between'>
                <Text className={`text-[14px] font-semibold ${!primary && !isOn ? 'text-[--text-primary]' : 'text-white'}`}>{title}</Text>
                <Text className='text-[--text-secondary] text-sm'>{description}</Text>
            </View>
            <ToggleSwitch isOn={isOn} onToggle={onToggle} />
        </View>
    );
}


/**
 * Notes on actions
   'mailto:your@address.com?subject=Test&body=Test' - opens the email app
   'sms:user?body=make%20an%20appointment' - opens the sms app
   'linkedin://profile/prakashiyerleadershipcoach' - opens the linkedin app

  'content://com.android.calendar/time' - opens the calendar app
   Create event:
    IntentLauncher.startActivity({
    action: IntentConstant.ACTION_INSERT,
    data: 'content://com.android.calendar/events',
    category: IntentConstant.CATEGORY_DEFAULT,
    extra: {
        beginTime: startTime.getTime(),
        endTime: endTime.getTime(),
        title: 'Sample Event',
        eventLocation: 'Test',
        description: 'Test'
    }
})

*/