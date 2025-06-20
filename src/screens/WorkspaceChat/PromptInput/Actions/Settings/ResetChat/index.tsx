import { Fragment } from "react";
import { ArrowClockwise } from "phosphor-react-native";
import { View, Text, TouchableOpacity } from "react-native";
import { useBottomSheet } from "@/contexts/BottomSheetContext";
import { showToast } from "@/utils/Notification";
import uiStore from "@/store/UIStore";
import { CHAT_HANDLER_EVENTS } from "@/hooks/useChatHandler";

export default function ResetChatActionButton() {
    const { dismissAllSheets } = useBottomSheet();
    const handleReset = () => {
        dismissAllSheets();
        uiStore.emitter.emit(CHAT_HANDLER_EVENTS.RESET_CHAT);
        showToast("Chats history cleared");
    }

    return (
        <Fragment>
            <TouchableOpacity onPress={handleReset} style={{ gap: 11 }} className='flex flex-col items-center justify-center'>
                <View style={{ backgroundColor: '#3f3f42', width: 52, height: 52 }} className='flex flex-col items-center justify-center rounded-full'>
                    <ArrowClockwise size={32} color="#FFF" />
                </View>
                <Text className='text-white text-lg font-medium'>Reset</Text>
            </TouchableOpacity>
        </Fragment>
    );
}