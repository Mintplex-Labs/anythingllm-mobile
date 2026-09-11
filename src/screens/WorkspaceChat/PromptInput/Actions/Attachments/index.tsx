import React, { useEffect, useMemo, useRef } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Camera, DownloadSimple, Images, Paperclip, X } from "phosphor-react-native";
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useBottomSheet, BOTTOM_SHEET_NAMES } from '@/contexts/BottomSheetContext';
import { WorkspaceType } from '@/database/models/Workspace';
import { WorkspaceThreadType } from '@/database/models/WorkspaceThread';
import { AttachmentInterface, IMAGE_MAX_DIMENSION, type ImageSource } from '@/hooks/useAttachments';
import useVisionSupport, { VISION_UNSUPPORTED_REASONS, type VisionSupport } from '@/hooks/useVisionSupport';
import useMmprojDownload from '@/hooks/useMmprojDownload';
import useLlmPreference from '@/hooks/useLLMPreference';
import { formatBytes } from '@/utils/formatters';
import { GenericSettingsItem } from '../Settings';

/**
 * Bottom sheet opened by the "+" in the prompt input. Mirrors the sliders (settings) sheet.
 *
 * Actions:
 *  - Attach files: parse + embed a text/pdf/markdown file into the workspace (local workspaces only)
 *  - Gallery / Take photo: attach an image to the prompt. Only offered when the current model can
 *    read images - always for hosted providers, only with a downloaded vision projector on-device, and
 *    never for remote workspaces since the mobile API cannot take images yet (see `useVisionSupport`).
 *    An on-device vision model without its projector gets an inline "download image support" action.
 *
 * Must live at the top level of the chat screen (not inside PromptInput) so its ref survives.
 */
export default function AttachmentsActionSheet({ workspace, thread, attachmentHandler }: { workspace: WorkspaceType, thread: WorkspaceThreadType, attachmentHandler: AttachmentInterface }) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const { registerSheet, presentSheet, activeSheet } = useBottomSheet();
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
    const snapPoints = useMemo(() => [vision.needsProjectorDownload ? '29%' : '25%'], [vision.needsProjectorDownload]);

    return (
        <BottomSheetModal
            ref={sheetRef}
            index={0}
            snapPoints={snapPoints}
            enableDynamicSizing={false}
            enablePanDownToClose={true}
            backgroundStyle={{ backgroundColor: '#1B1B1E' }}
            handleIndicatorStyle={{ backgroundColor: '#9F9FA0', width: 45, margin: 10 }}
            // If this sheet is dismissed AND was the current focused, present the primary prompt input sheet
            onDismiss={() => activeSheet === BOTTOM_SHEET_NAMES.ATTACHMENTS && presentSheet(BOTTOM_SHEET_NAMES.PRIMARY_PROMPT_INPUT, true)}
        >
            <View style={{ paddingHorizontal: 30 }} className='flex flex-col'>
                <View className='flex flex-row items-start justify-between'>
                    <GenericSettingsItem
                        disabled={filesDisabled}
                        icon={<Paperclip size={32} color="#FFF" />}
                        text="Attach files"
                        onPress={() => runAction(attachmentHandler.askForAttachment)}
                    />
                    <GenericSettingsItem
                        disabled={imagesDisabled}
                        icon={<Images size={32} color="#FFF" />}
                        text="Gallery"
                        onPress={() => pickImage('gallery')}
                    />
                    <GenericSettingsItem
                        disabled={imagesDisabled}
                        icon={<Camera size={32} color="#FFF" />}
                        text="Take photo"
                        onPress={() => pickImage('camera')}
                    />
                </View>
                <SheetHint
                    isRemote={isRemote}
                    isMaxAttachments={attachmentHandler.isMaxAttachments}
                    vision={vision}
                />
            </View>
        </BottomSheetModal>
    );
}

/**
 * One line under the actions explaining why something is disabled. For an on-device vision model
 * that is missing its projector this becomes the download action itself (tap to start, progress bar
 * with cancel while running, and vision unlocks when it finishes).
 */
function SheetHint({ isRemote, isMaxAttachments, vision }: { isRemote: boolean; isMaxAttachments: boolean; vision: VisionSupport }) {
    const { supportsVision, reason, needsProjectorDownload, model, refresh } = vision;
    const download = useMmprojDownload(model);

    // The downloader moves the file into place then reports complete - re-check so the buttons unlock.
    useEffect(() => {
        if (download.status === 'complete') refresh();
    }, [download.status, refresh]);

    if (isMaxAttachments) return <HintText>You have reached the maximum number of attachments for one prompt.</HintText>;
    if (isRemote) return <HintText>{VISION_UNSUPPORTED_REASONS.REMOTE}</HintText>;
    if (supportsVision) return null;

    if (needsProjectorDownload && model?.mmproj) {
        if (download.isDownloading) {
            return (
                <View style={{ marginTop: 14, gap: 8 }}>
                    <View className='flex flex-row items-center justify-between'>
                        <Text className='text-sm' style={{ color: '#9F9FA0' }}>Downloading image support... {download.progress}%</Text>
                        <TouchableOpacity onPress={download.cancel} accessibilityLabel='Cancel download' className='flex flex-row items-center' style={{ gap: 4 }}>
                            <X size={14} color="#FFF" />
                            <Text className='text-white text-sm font-medium'>Cancel</Text>
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
                    accessibilityLabel='Download image support'
                    className='flex flex-row items-center justify-center'
                    style={{ gap: 8 }}
                >
                    <DownloadSimple size={18} color="#FFF" />
                    <Text className='text-white text-sm font-medium text-center'>
                        {VISION_UNSUPPORTED_REASONS.NEEDS_DOWNLOAD} Tap to download ({formatBytes(model.mmproj.size)}).
                    </Text>
                </TouchableOpacity>
                {download.status === 'failed' && <HintText>{download.error || 'The download failed. Tap to try again.'}</HintText>}
                {download.status === 'cancelled' && <HintText>Download cancelled.</HintText>}
            </View>
        );
    }

    return reason ? <HintText>{reason}</HintText> : null;
}

function HintText({ children }: { children: React.ReactNode }) {
    return <Text className='text-center text-sm' style={{ color: '#9F9FA0', marginTop: 14 }}>{children}</Text>;
}
