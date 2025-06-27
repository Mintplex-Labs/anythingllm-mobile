import { useCallback, useEffect, useRef, useState } from "react";
import { BottomSheetBackdrop, BottomSheetBackdropProps, BottomSheetModal } from '@gorhom/bottom-sheet';
import { useBottomSheet, BOTTOM_SHEET_NAMES } from '@/contexts/BottomSheetContext';
import { View, Text, TouchableOpacity, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScrollView } from "react-native-gesture-handler";
import uiStore from "@/store/UIStore";
import { type WorkspaceChatType, type IDocumentCitation, type IAgentWebSearchCitation } from "@/database/models/WorkspaceChat";
import { numberToPercentageString, getOrigin } from "@/utils/formatters";
import { ArrowSquareOut, FileText, Globe } from "phosphor-react-native";

const CITATION_COMPONENT = {
    document: DocumentCitation,
    'web-search': WebSearchCitation,
}

export default function CitationsActionSheet() {
    const insets = useSafeAreaInsets();
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const { registerSheet, presentSheet, dismissSheet } = useBottomSheet();
    const [focusedCitations, setFocusedCitations] = useState<WorkspaceChatType['response']['citations']>([]);
    const renderBackdrop = useCallback(
        (props: BottomSheetBackdropProps) => (
            <BottomSheetBackdrop
                {...props}
                disappearsOnIndex={-1}
                appearsOnIndex={0}
                opacity={0.7}
            />
        ),
        []
    );

    useEffect(() => {
        registerSheet(BOTTOM_SHEET_NAMES.CITATIONS, bottomSheetRef);
    }, [registerSheet]);

    useEffect(() => {
        uiStore.emitter.addListener(uiStore.globalEvents.CITATIONS_FOCUSED, (citations: WorkspaceChatType['response']['citations']) => {
            setFocusedCitations(citations);
            if (citations.length) presentSheet(BOTTOM_SHEET_NAMES.CITATIONS, true);
        });
        return () => uiStore.emitter.removeAllListeners(uiStore.globalEvents.CITATIONS_FOCUSED);
    }, []);

    return (
        <BottomSheetModal
            ref={bottomSheetRef}
            index={0}
            snapPoints={['50%', '95%']}
            enableDynamicSizing={false}
            backdropComponent={renderBackdrop}
            backgroundStyle={{ backgroundColor: '#1B1B1E' }}
            handleIndicatorStyle={{ backgroundColor: '#9F9FA0', width: 45, margin: 10 }}
            onDismiss={() => dismissSheet(BOTTOM_SHEET_NAMES.CITATIONS)}
        >
            <ScrollView style={{ paddingHorizontal: 30, paddingBottom: insets.bottom }}>
                <View style={{ marginBottom: 24 }} className='flex w-full flex-row items-center justify-center'>
                    <Text className='text-white text-lg font-medium'>Citations</Text>
                </View>
                <View style={{ gap: 24 }} className='flex flex-col items-start justify-between'>
                    {focusedCitations.map((citation, index) => {
                        const Component = CITATION_COMPONENT[citation.type];
                        if (!Component) return null;
                        // @ts-ignore
                        return <Component key={`${citation.type}-${index}`} citation={citation} />
                    })}
                </View>
            </ScrollView>
        </BottomSheetModal>
    );
}

function DocumentCitation({ citation }: { citation: IDocumentCitation }) {
    return (
        <View className='flex flex-col items-start justify-between w-full' style={{ gap: 12 }}>
            <View className='flex flex-row items-center justify-between w-full'>
                <View className='flex flex-row items-center' style={{ gap: 4 }}>
                    <FileText size={18} color="#FFF" />
                    <Text className='text-white text-lg font-semibold'>{citation.document.name}</Text>
                </View>
                {citation.document.score && <Text style={{ color: '#9F9FA0' }}>Score: {numberToPercentageString(citation.document.score)}</Text>}
            </View>
            <Text style={{ color: '#9F9FA0' }} className="">{citation.document.chunk}</Text>
        </View>
    )
}

function WebSearchCitation({ citation }: { citation: IAgentWebSearchCitation }) {
    return (
        <TouchableOpacity onPress={() => Linking.openURL(citation.reference.url)} className='flex flex-col items-start justify-between w-full' style={{ gap: 12 }}>
            <View className='flex flex-col' style={{ gap: 2 }}>
                <View className='flex flex-row items-center justify-between w-full'>
                    <View className='flex flex-row items-center' style={{ gap: 4, maxWidth: '95%' }}>
                        <Globe size={18} color="#7cd4fd" />
                        <Text className='text-white text-lg font-semibold' numberOfLines={1} ellipsizeMode="tail">{citation.reference.title || getOrigin(citation.reference.url)}</Text>
                        <ArrowSquareOut size={18} color="#888" />
                    </View>
                </View>
                <Text style={{ color: '#9F9FA0', opacity: 0.7 }} className="text-xs">{citation.reference.url}</Text>
            </View>
            <Text style={{ color: '#9F9FA0' }} className="">{citation.reference.content}</Text>
        </TouchableOpacity>
    )
}
