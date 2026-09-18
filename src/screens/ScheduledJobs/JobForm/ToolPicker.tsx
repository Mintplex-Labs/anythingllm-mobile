import { Text, View } from 'react-native';
import ToggleSwitch from '@/components/ToggleSwitch';
import ToolsManager, { TOOL_GROUPS, type ToolGroupId, type ToolManagerTool } from '@/utils/ToolsManager';
import { Card, JOB_COLORS, SectionLabel } from '../components';

/**
 * Which tools the job may call. Unlike the chat tools sheet this is per job and independent of
 * the user's global toggles: the user curates exactly what this prompt needs, so the runner
 * offers the model all of them with no relevance reranking. Nothing selected means a plain reply.
 */
export default function ToolPicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
    const toggle = (tool: ToolManagerTool) => {
        onChange(selected.includes(tool.id) ? selected.filter((id) => id !== tool.id) : [...selected, tool.id]);
    };

    const ungrouped = ToolsManager.configurableTools.filter((tool) => tool.category === 'default' && !tool.group);
    const appConnections = ToolsManager.configurableTools.filter((tool) => tool.category === 'appConnections');
    const groups = (Object.keys(TOOL_GROUPS) as ToolGroupId[]).map((groupId) => ({
        ...TOOL_GROUPS[groupId],
        tools: ToolsManager.configurableTools.filter((tool) => tool.group === groupId),
    }));

    return (
        <View className="flex flex-col" style={{ gap: 12 }}>
            <SectionLabel trailing={<Text style={{ color: JOB_COLORS.muted }} className="text-sm">{selected.length ? `${selected.length} selected` : 'None - reply only'}</Text>}>
                Tools
            </SectionLabel>
            <Card style={{ gap: 16 }}>
                {ungrouped.map((tool) => <ToolRow key={tool.id} tool={tool} isOn={selected.includes(tool.id)} onToggle={() => toggle(tool)} />)}
                {groups.map((group) => (
                    <View key={group.id} className="flex flex-col" style={{ gap: 12, paddingTop: 4 }}>
                        <Text className="text-white font-semibold">{group.name}</Text>
                        {group.tools.map((tool) => <ToolRow key={tool.id} tool={tool} isOn={selected.includes(tool.id)} onToggle={() => toggle(tool)} />)}
                    </View>
                ))}
                <View className="flex flex-col" style={{ gap: 12, paddingTop: 4 }}>
                    <Text className="text-white font-semibold">App Connections</Text>
                    {appConnections.map((tool) => <ToolRow key={tool.id} tool={tool} isOn={selected.includes(tool.id)} onToggle={() => toggle(tool)} />)}
                </View>
            </Card>
            <Text style={{ color: JOB_COLORS.muted }} className="text-sm">
                Every tool you turn on is offered to the model on each run. Tools that would normally ask for your approval are approved automatically, since nobody is there to tap.
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
