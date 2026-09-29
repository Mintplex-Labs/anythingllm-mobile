import React, { useEffect, useRef } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Camera, DownloadSimple, Images, Paperclip, X } from "phosphor-react-native";
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomSheet, BOTTOM_SHEET_NAMES } from '@/contexts/BottomSheetContext';
import { WorkspaceType } from '@/database/models/Workspace';
import { WorkspaceThreadType } from '@/database/models/WorkspaceThread';
import { AttachmentInterface, IMAGE_MAX_DIMENSION, type DocumentAttachmentMode, type ImageSource } from '@/hooks/useAttachments';
import useVisionSupport, { VISION_UNSUPPORTED_REASONS, type VisionSupport } from '@/hooks/useVisionSupport';
import useMmprojDownload from '@/hooks/useMmprojDownload';
import useLlmPreference from '@/hooks/useLLMPreference';
import { formatBytes } from '@/utils/formatters';
import { GenericSettingsItem } from '../Settings';
import { useTranslation } from 'react-i18next';
import { tKey } from '@/i18n';

/**
 * Bottom sheet opened by the "+" in the prompt input. Mirrors the sliders (settings) sheet.
 *
 * Actions:
 *  - Attach files: parse a text/pdf/markdown/office file into the workspace (local workspaces only).
 *    Embedded for on-device models, sent whole to external providers - see `DocumentAttachmentMode`.
 *  - Gallery / Take photo: attach an image to the prompt. Only offered when the current model can
 *    read images - always for hosted providers, only with a downloaded vision projector on-device, and
 *    never for remote workspaces since the mobile API cannot take images yet (see `useVisionSupport`).
 *    An on-device vision model without its projector gets an inline "download image support" action.
 *
 * Must live at the top level of the chat screen (not inside PromptInput) so its ref survives.
 */
export default function AttachmentsActionSheet({ workspace, thread, attachmentHandler }: { workspace: WorkspaceType, thread: WorkspaceThreadType, attachmentHandler: AttachmentInterface }) {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const sheetRef = useRef<BottomSheetModal>(null);
    const { registerSheet, presentSheet, activeSheet, isSheetActive } = useBottomSheet();
    const { llmPreferences } = useLlmPreference();
    const isRemote = !!(workspace?.isRemote || thread?.isRemote);
    const vision = useVisionSupport({ isRemote });
    const { supportsVision, refresh: refreshVisionSupport } = vision;
    const isOpen = activeSheet === BOTTOM_SHEET_NAMES.ATTACHMENTS;

    useEffect(() => {
        registerSheet(BOTTOM_SHEET_NAMES.ATTACHMENTS, sheetRef);
    }, [registerSheet]);

    // A projector may have finished downloading since the last check - re-evaluate every time the sheet opens.
    useEffect(() => {
        if (isOpen) refreshVisionSupport();
    }, [isOpen, refreshVisionSupport]);

    /** Hand focus back to the prompt input, then run the action so the native picker opens over the chat. */
    function runAction(action: () => void | Promise<void>) {
        presentSheet(BOTTOM_SHEET_NAMES.PRIMARY_PROMPT_INPUT, true);
        Promise.resolve(action()).catch((e) => console.log('[AttachmentsActionSheet] action failed', e));
    }

    function pickImage(source: ImageSource) {
        // Keep on-device images small - they share a 1-2k token window with everything else.
        const maxDimension = llmPreferences?.provider === 'native' ? IMAGE_MAX_DIMENSION.onDevice : IMAGE_MAX_DIMENSION.external;
        runAction(() => attachmentHandler.askForImage(source, { maxDimension }));
    }

    const filesDisabled = isRemote || attachmentHandler.isMaxAttachments;
    const imagesDisabled = !supportsVision || attachmentHandler.isMaxAttachments;

    return (
        <BottomSheetModal
            ref={sheetRef}
            index={0}
            enableDynamicSizing
            enablePanDownToClose={true}
            backgroundStyle={{ backgroundColor: '#1B1B1E' }}
            handleIndicatorStyle={{ backgroundColor: '#9F9FA0', width: 45, margin: 10 }}
            // If this sheet is dismissed AND was the current focused, present the primary prompt input sheet
            onDismiss={() => isSheetActive(BOTTOM_SHEET_NAMES.ATTACHMENTS) && presentSheet(BOTTOM_SHEET_NAMES.PRIMARY_PROMPT_INPUT, true)}
        >
            <BottomSheetView style={{ paddingHorizontal: 30, paddingBottom: Math.max(insets.bottom, 16) + 8 }} className='flex flex-col'>
                <View className='flex flex-row items-start justify-between'>
                    <GenericSettingsItem
                        disabled={filesDisabled}
                        icon={<Paperclip size={32} color="#FFF" />}
                        text={t('chat.attachments.attach_files')}
                        onPress={() => runAction(attachmentHandler.askForAttachment)}
                    />
                    <GenericSettingsItem
                        disabled={imagesDisabled}
                        icon={<Images size={32} color="#FFF" />}
                        text={t('chat.attachments.gallery')}
                        onPress={() => pickImage('gallery')}
                    />
                    <GenericSettingsItem
                        disabled={imagesDisabled}
                        icon={<Camera size={32} color="#FFF" />}
                        text={t('chat.attachments.take_photo')}
                        onPress={() => pickImage('camera')}
                    />
                </View>
                <SheetHint
                    isRemote={isRemote}
                    isMaxAttachments={attachmentHandler.isMaxAttachments}
                    documentMode={attachmentHandler.documentMode}
                    vision={vision}
                />
            </BottomSheetView>
        </BottomSheetModal>
    );
}

/** What happens to an attached file with the current provider - shown when nothing else needs explaining. Translation keys. */
const DOCUMENT_MODE_HINTS: Record<DocumentAttachmentMode, string> = {
    embed: tKey('chat.attachments.hint_embed'),
    full: tKey('chat.attachments.hint_full'),
};

/**
 * One line under the actions explaining why something is disabled. For an on-device vision model
 * that is missing its projector this becomes the download action itself (tap to start, progress bar
 * with cancel while running, and vision unlocks when it finishes). When everything is available it
 * tells the user how files reach the model instead.
 */
function SheetHint({ isRemote, isMaxAttachments, documentMode, vision }: { isRemote: boolean; isMaxAttachments: boolean; documentMode: DocumentAttachmentMode; vision: VisionSupport }) {
    const { t } = useTranslation();
    const { supportsVision, reason, needsProjectorDownload, model, refresh } = vision;
    const download = useMmprojDownload(model);

    // The downloader moves the file into place then reports complete - re-check so the buttons unlock.
    useEffect(() => {
        if (download.status === 'complete') refresh();
    }, [download.status, refresh]);

    if (isMaxAttachments) return <HintText>{t('chat.attachments.max_reached')}</HintText>;
    if (isRemote) return <HintText>{VISION_UNSUPPORTED_REASONS.REMOTE}</HintText>;
    if (supportsVision) return <HintText>{t(DOCUMENT_MODE_HINTS[documentMode])}</HintText>;

    if (needsProjectorDownload && model?.mmproj) {
        if (download.isDownloading) {
            return (
                <View style={{ marginTop: 14, gap: 8 }}>
                    <View className='flex flex-row items-center justify-between'>
                        <Text className='text-sm' style={{ color: '#9F9FA0' }}>{t('chat.attachments.downloading_image_support', { progress: download.progress })}</Text>
                        <TouchableOpacity onPress={download.cancel} accessibilityLabel={t('chat.attachments.cancel_download')} className='flex flex-row items-center' style={{ gap: 4 }}>
                            <X size={14} color="#FFF" />
                            <Text className='text-white text-sm font-medium'>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: '#3f3f42', overflow: 'hidden' }}>
                        <View style={{ height: '100%', width: `${Math.max(2, download.progress)}%`, backgroundColor: '#FFF', borderRadius: 3 }} />
                    </View>
                </View>
            );
        }

        return (
            <View style={{ marginTop: 14, gap: 6 }}>
                <TouchableOpacity
                    onPress={() => download.requestDownload()}
                    accessibilityLabel={t('chat.attachments.download_image_support')}
                    className='flex flex-row items-center justify-center'
                    style={{ gap: 8 }}
                >
                    <DownloadSimple size={18} color="#FFF" />
                    <Text className='text-white text-sm font-medium text-center'>
                        {t('chat.attachments.needs_download_tap', { size: formatBytes(model.mmproj.size) })}
                    </Text>
                </TouchableOpacity>
                {download.status === 'failed' && <HintText>{download.error || t('chat.attachments.download_failed')}</HintText>}
            </View>
        );
    }

    return reason ? <HintText>{reason}</HintText> : null;
}

function HintText({ children }: { children: React.ReactNode }) {
    return <Text className='text-center text-sm' style={{ color: '#9F9FA0', marginTop: 14 }}>{children}</Text>;
}
