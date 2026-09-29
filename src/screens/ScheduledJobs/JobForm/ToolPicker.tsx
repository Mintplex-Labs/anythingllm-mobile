import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import ToggleSwitch from '@/components/ToggleSwitch';
import ToolsManager, { TOOL_GROUPS, type ToolGroup, type ToolManagerTool } from '@/utils/ToolsManager';
import { showToast } from '@/utils/Notification';
import { Card, JOB_COLORS, SectionLabel } from '../components';

/**
 * Which tools the job may call. Unlike the chat tools sheet this is per job and independent of
 * the user's global toggles: the user curates exactly what this prompt needs, so the runner
 * offers the model all of them with no relevance reranking. Nothing selected means a plain reply.
 */
export default function ToolPicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
    const { t } = useTranslation();
    const toggle = async (tool: ToolManagerTool) => {
        if (selected.includes(tool.id)) return onChange(selected.filter((id) => id !== tool.id));
        // A run has nobody to answer a permission dialog - ask now, while the user is here.
        if (tool.requestPermission && !(await tool.requestPermission())) {
            if (tool.permissionDeniedMessage) showToast(tool.permissionDeniedMessage);
            return;
        }
        onChange([...selected, tool.id]);
    };

    const eligible = ToolsManager.scheduledJobEligibleTools;
    const ungrouped = eligible.filter((tool) => tool.category === 'default' && !tool.group);
    const appConnections = eligible.filter((tool) => tool.category === 'appConnections' && !tool.group);
    const groupsIn = (category: ToolManagerTool['category']) => (Object.values(TOOL_GROUPS) as ToolGroup[])
        .filter((group) => group.category === category)
        .map((group) => ({ ...group, tools: eligible.filter((tool) => tool.group === group.id) }))
        .filter((group) => group.tools.length > 0);
    const renderGroup = (group: ToolGroup & { tools: ToolManagerTool[] }) => (
        <View key={group.id} className="flex flex-col" style={{ gap: 12, paddingTop: 4 }}>
            <Text className="text-white font-semibold">{group.name}</Text>
            {group.tools.map((tool) => <ToolRow key={tool.id} tool={tool} isOn={selected.includes(tool.id)} onToggle={() => toggle(tool)} />)}
        </View>
    );

    return (
        <View className="flex flex-col" style={{ gap: 12 }}>
            <SectionLabel trailing={<Text style={{ color: JOB_COLORS.muted }} className="text-sm">{selected.length ? t('scheduled_jobs.tool_picker.selected_count', { count: selected.length }) : t('scheduled_jobs.tool_picker.none_reply_only')}</Text>}>
                {t('scheduled_jobs.tools')}
            </SectionLabel>
            <Card style={{ gap: 16 }}>
                {ungrouped.map((tool) => <ToolRow key={tool.id} tool={tool} isOn={selected.includes(tool.id)} onToggle={() => toggle(tool)} />)}
                {groupsIn('default').map(renderGroup)}
                <View className="flex flex-col" style={{ gap: 12, paddingTop: 4 }}>
                    <Text className="text-white font-semibold">{t('scheduled_jobs.tool_picker.app_connections')}</Text>
                    {appConnections.map((tool) => <ToolRow key={tool.id} tool={tool} isOn={selected.includes(tool.id)} onToggle={() => toggle(tool)} />)}
                </View>
                {groupsIn('appConnections').map(renderGroup)}
            </Card>
            <Text style={{ color: JOB_COLORS.muted }} className="text-sm">
                {t('scheduled_jobs.tool_picker.explainer')}
            </Text>
        </View>
    );
}

function ToolRow({ tool, isOn, onToggle }: { tool: ToolManagerTool; isOn: boolean; onToggle: () => void }) {
    return (
        <View className="flex w-full flex-row items-center justify-between">
            <View className="flex flex-col items-start" style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ color: isOn ? JOB_COLORS.text : JOB_COLORS.muted }} className="text-[14px] font-semibold">{tool.name}</Text>
                <Text style={{ color: JOB_COLORS.muted, maxWidth: '95%' }} className="text-sm">{tool.description}</Text>
            </View>
            <ToggleSwitch isOn={isOn} onToggle={onToggle} />
        </View>
    );
}
