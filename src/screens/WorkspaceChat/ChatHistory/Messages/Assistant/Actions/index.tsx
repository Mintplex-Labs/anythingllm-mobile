import { Linking, Text, TouchableOpacity } from "react-native";
import { type DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";
import { ScrollView } from "react-native-gesture-handler";
import { IAgentAction } from "@/database/models/WorkspaceChat";
import IntentLauncher, { IntentConstant } from "@yz1311/react-native-intent-launcher";

export default function ActionsContainer({ chat }: { chat: DynamicChatMessage }) {
    const actions = chat.response?.actions || [];
    if (actions.length === 0) return null;

    function onPress(action: IAgentAction) {
        switch (action.type) {
            case 'calendar_event_creation':
                const { beginTime, endTime, title, eventLocation, description, allDay } = action.action;
                const intentPayload = {
                    action: IntentConstant.ACTION_INSERT,
                    data: 'content://com.android.calendar/events',
                    package: 'com.google.android.calendar',
                    type: 'vnd.android.cursor.item/event',
                    extra: {
                        'android.intent.CalendarContract.EXTRA_EVENT_BEGIN_TIME': new Date(beginTime).getTime(),
                        'android.intent.CalendarContract.EXTRA_EVENT_END_TIME': new Date(endTime).getTime(),
                        'title': title,
                        'description': description,
                        'eventLocation': eventLocation,
                        'allDay': allDay,
                    } as any
                }
                // @ts-ignore
                IntentLauncher.startActivity(intentPayload);
                break;
            default:
                Linking.openURL(action.action.link);
                break;
        }
    }
    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
                gap: 10,
                paddingHorizontal: 10,
                flexDirection: 'row'
            }}
        >
            {actions.map((action, index) => {
                return (
                    <TouchableOpacity
                        key={`${action.type}-${index}`}
                        activeOpacity={0.8}
                        onPress={() => onPress(action)}
                        className="flex flex-row items-start justify-start rounded-full"
                        style={{ borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 6 }}
                    >
                        <Text style={{ color: '#7CD4FD' }} className="text-sm">{action.action.title}</Text>
                    </TouchableOpacity >
                )
            })}
        </ScrollView>
    )
}
