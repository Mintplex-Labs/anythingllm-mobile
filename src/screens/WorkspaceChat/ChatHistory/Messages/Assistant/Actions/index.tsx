import { Linking, Text, TouchableOpacity, ScrollView } from "react-native";
import { memo } from "react";
import { IAgentAction } from "@/database/models/WorkspaceChat";

/** Action types that render as their own full-width card instead of a chip (`sms` / `email` are the old text and email drafts) */
export const CARD_ACTION_TYPES: string[] = ['file_download', 'scheduled_job_created', 'text_draft', 'sms', 'email_draft', 'email', 'calendar_event_creation', 'reminder_set', 'browser_use_session'];

/** Link-style chips for actions that open another app. Generated files, created jobs, drafts and calendar events render as their own cards instead. */
export default memo(function ActionsContainer({ actions: allActions = [] }: { actions?: IAgentAction[] }) {
    const actions = allActions.filter(action => !CARD_ACTION_TYPES.includes(action.type));
    if (actions.length === 0) return null;

    function onPress(action: IAgentAction) {
        if ('link' in action.action) Linking.openURL(action.action.link);
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
                        <Text style={{ color: '#7CD4FD' }} className="text-sm">{'title' in action.action ? action.action.title : ''}</Text>
                    </TouchableOpacity >
                )
            })}
        </ScrollView>
    )
});
