import { type DynamicChatMessage } from "@/screens/WorkspaceChat/ChatHistory";
import { type IChatCitation } from "@/database/models/WorkspaceChat";
import { Text, TouchableOpacity, View } from "react-native";
import { FileText } from "phosphor-react-native";
import Favicon from "@/screens/WorkspaceChat/ChatHistory/CitationsActionSheet/Favicon";
import uiStore from "@/store/UIStore";

const CIRCLE_SIZE = 22;
const ICON_SIZE = CIRCLE_SIZE - 2;
const OVERLAP_OFFSET = 17;
const MAX_VISIBLE = 3;
const RING_COLOR = "rgba(255,255,255,0.6)";

/**
 * Collapses citations that point at the same document or URL so the chip
 * reflects distinct sources rather than every chunk referenced.
 */
export function combineLikeCitations(citations: IChatCitation[]): IChatCitation[] {
    const seen = new Set<string>();
    const unique: IChatCitation[] = [];
    for (const citation of citations) {
        const key = citation.type === 'web-search'
            ? `web:${citation.reference.url}`
            : `doc:${citation.document.uuid || citation.document.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(citation);
    }
    return unique;
}

function SourceCircle({ citation }: { citation: IChatCitation }) {
    if (citation.type === 'web-search') return <Favicon url={citation.reference.url} size={ICON_SIZE} fallbackColor="#000" />;
    return (
        <View
            style={{ width: ICON_SIZE, height: ICON_SIZE, borderRadius: ICON_SIZE / 2, backgroundColor: '#FFF' }}
            className="flex items-center justify-center"
        >
            <FileText size={11} color="#000" weight="bold" />
        </View>
    );
}

export default function CitationsContainer({ chat }: { chat: DynamicChatMessage }) {
    const citations = chat.response?.citations;
    if (!citations?.length || chat.isLoading) return null;

    const combined = combineLikeCitations(citations);
    const visible = combined.slice(0, MAX_VISIBLE);
    const remaining = Math.max(0, combined.length - MAX_VISIBLE);

    return (
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => uiStore.emitter.emit(uiStore.globalEvents.CITATIONS_FOCUSED, citations)}
            className="flex flex-row items-center justify-start rounded-full"
            style={{ borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 5, gap: 6 }}
        >
            <Text style={{ color: '#FFF' }} className="text-xs">Sources</Text>
            <View style={{ position: 'relative', height: CIRCLE_SIZE, width: (visible.length - 1) * OVERLAP_OFFSET + CIRCLE_SIZE }}>
                {visible.map((citation, idx) => (
                    <View
                        key={idx}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: idx * OVERLAP_OFFSET,
                            zIndex: MAX_VISIBLE - idx,
                            width: CIRCLE_SIZE,
                            height: CIRCLE_SIZE,
                            borderRadius: CIRCLE_SIZE / 2,
                            borderWidth: 1,
                            borderColor: RING_COLOR,
                            backgroundColor: "#FFF",
                            overflow: 'hidden',
                        }}
                        className="flex items-center justify-center"
                    >
                        <SourceCircle citation={citation} />
                    </View>
                ))}
            </View>
            {remaining > 0 && <Text style={{ color: '#FFF' }} className="text-xs">+ {remaining}</Text>}
        </TouchableOpacity>
    )
}
