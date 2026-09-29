import { useCallback, useEffect, useRef, useState } from "react";
import { BottomSheetBackdrop, BottomSheetBackdropProps, BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useBottomSheet, BOTTOM_SHEET_NAMES } from '@/contexts/BottomSheetContext';
import { View, Text, TouchableOpacity, Linking, Image } from "react-native";
import useCalendarApp from "@/hooks/useCalendarApp";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import uiStore from "@/store/UIStore";
import { type WorkspaceChatType, type IDocumentCitation, type IAgentWebSearchCitation, type IAgentCalendarEventCitation } from "@/database/models/WorkspaceChat";
import { numberToPercentageString, getOrigin } from "@/utils/formatters";
import { formatEventWhen, viewCalendarEvent } from "@/utils/calendar";
import { showToast } from "@/utils/Notification";
import { ArrowSquareOut, CalendarBlank, FileText, MapPin } from "phosphor-react-native";
import Favicon from "./Favicon";
import { useTranslation } from "react-i18next";

const CITATION_COMPONENT = {
    document: DocumentCitation,
    'web-search': WebSearchCitation,
    'calendar-event': CalendarEventCitation,
}

export default function CitationsActionSheet() {
    const { t } = useTranslation();
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
        const subscription = uiStore.emitter.addListener(uiStore.globalEvents.CITATIONS_FOCUSED, (citations: WorkspaceChatType['response']['citations']) => {
            setFocusedCitations(citations);
            if (citations.length) presentSheet(BOTTOM_SHEET_NAMES.CITATIONS, true);
        });
        // Only drop our own subscription - the Quick Actions card mounts this sheet as well.
        return () => subscription.remove();
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
            <BottomSheetScrollView style={{ paddingHorizontal: 30, paddingBottom: insets.bottom }}>
                <View style={{ marginBottom: 24 }} className='flex w-full flex-row items-center justify-center'>
                    <Text className='text-white text-lg font-medium'>{t('chat.citations.title')}</Text>
                </View>
                <View style={{ gap: 24 }} className='flex flex-col items-start justify-between'>
                    {focusedCitations.map((citation, index) => {
                        const Component = CITATION_COMPONENT[citation.type];
                        if (!Component) return null;
                        // @ts-ignore
                        return <Component key={`${citation.type}-${index}`} citation={citation} />
                    })}
                </View>
            </BottomSheetScrollView>
        </BottomSheetModal>
    );
}

function DocumentCitation({ citation }: { citation: IDocumentCitation }) {
    const { t } = useTranslation();
    return (
        <View className='flex flex-col items-start justify-between w-full' style={{ gap: 12 }}>
            <View className='flex flex-row items-center justify-between w-full'>
                <View className='flex flex-row items-center' style={{ gap: 4 }}>
                    <FileText size={18} color="#FFF" />
                    <Text className='text-white text-lg font-semibold'>{citation.document.name}</Text>
                </View>
                {citation.document.score && <Text style={{ color: '#9F9FA0' }}>{t('chat.citations.score', { score: numberToPercentageString(citation.document.score) })}</Text>}
            </View>
            <Text style={{ color: '#9F9FA0' }} className="">{citation.document.chunk}</Text>
        </View>
    )
}

/** An event the assistant read from the calendar - tapping opens it in the calendar app */
function CalendarEventCitation({ citation }: { citation: IAgentCalendarEventCitation }) {
    const { t } = useTranslation();
    const { event } = citation;
    const calendarApp = useCalendarApp();

    function open() {
        viewCalendarEvent(event).catch((error: unknown) => {
            console.error('[CitationsActionSheet] opening calendar event failed', error);
            showToast(t('chat.citations.calendar_open_failed'));
        });
    }

    return (
        <TouchableOpacity
            onPress={open}
            accessibilityRole="button"
            accessibilityLabel={t('chat.citations.calendar_open_label', { title: event.title || t('chat.citations.calendar_untitled') })}
            className='flex flex-col items-start justify-between w-full'
            style={{ gap: 12 }}>
            <View className='flex flex-col w-full' style={{ gap: 2 }}>
                <View className='flex flex-row items-center' style={{ gap: 6, maxWidth: '95%' }}>
                    {calendarApp?.icon
                        ? <Image source={{ uri: calendarApp.icon }} accessibilityLabel={calendarApp.label} style={{ width: 18, height: 18, borderRadius: 9 }} />
                        : <CalendarBlank size={18} color="#FFF" />}
                    <Text className='text-white text-lg font-semibold' numberOfLines={1} ellipsizeMode="tail">{event.title || t('chat.citations.calendar_untitled')}</Text>
                    <ArrowSquareOut size={18} color="#888" />
                </View>
                <View className='flex flex-row items-center' style={{ gap: 6, opacity: 0.7 }}>
                    <Text style={{ color: '#9F9FA0' }} className="text-xs">{formatEventWhen(event, t('chat.calendar_event.all_day'))}</Text>
                    {!!event.calendarTitle && (
                        <>
                            <Text style={{ color: '#9F9FA0' }} className="text-xs">·</Text>
                            {/* Calendar color, so Work and Personal events tell apart at a glance */}
                            {!!event.calendarColor && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: event.calendarColor }} />}
                            <Text style={{ color: '#9F9FA0', flexShrink: 1 }} numberOfLines={1} className="text-xs">{event.calendarTitle}</Text>
                        </>
                    )}
                </View>
            </View>
            {!!event.location && (
                <View className='flex flex-row items-center' style={{ gap: 6 }}>
                    <MapPin size={14} color="#9F9FA0" />
                    <Text style={{ color: '#9F9FA0', flexShrink: 1 }} numberOfLines={2}>{event.location}</Text>
                </View>
            )}
            {!!event.description && <Text style={{ color: '#9F9FA0' }} numberOfLines={4}>{event.description}</Text>}
        </TouchableOpacity>
    )
}

function WebSearchCitation({ citation }: { citation: IAgentWebSearchCitation }) {
    return (
        <TouchableOpacity onPress={() => Linking.openURL(citation.reference.url)} className='flex flex-col items-start justify-between w-full' style={{ gap: 12 }}>
            <View className='flex flex-col' style={{ gap: 2 }}>
                <View className='flex flex-row items-center justify-between w-full'>
                    <View className='flex flex-row items-center' style={{ gap: 4, maxWidth: '95%' }}>
                        <Favicon url={citation.reference.url} size={18} />
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
