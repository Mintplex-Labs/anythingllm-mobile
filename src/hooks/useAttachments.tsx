import { Text, TouchableOpacity, View, Alert, ActivityIndicator, ScrollView, Image, PermissionsAndroid } from "react-native";
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { generateUUID, getCurrentDeviceInfo, screenDimensions, } from "@/utils/constants";
import * as RNFS from '@dr.pogodin/react-native-fs';
import Storage from "@/utils/storage";
import { pick } from 'react-native-document-picker';
import { launchCamera, launchImageLibrary, type ImageLibraryOptions, type CameraOptions } from 'react-native-image-picker';
import getEmbedder from "@/utils/Embedder";
import VectorDB from "@/utils/VectorDB";
import Document from "@/database/models/Document";
import { showToast } from "@/utils/Notification";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { snapPointsDefault } from "@/screens/WorkspaceChat/PromptInput";
import { CHAT_HANDLER_EVENTS } from "@/hooks/useChatHandler";
import uiStore from "@/store/UIStore";
import PDFParser from "@/utils/PDFParser";
import { storeProcessedFileAsText } from "@/utils/fs";
import Telemetry from "@/utils/Telemetry";
import { type IAttachment } from "@/utils/AiProviders/baseOpenAILikeProvider";
import { ImageLightbox } from "@/components/ImageAttachmentGrid";

const MAX_ATTACHMENTS = 4;

/**
 * Longest edge (px) an attached image is scaled down to before it is base64 encoded. Aspect ratio is
 * kept by the picker. Every image costs context window: roughly (w*h)/(28*28) tokens for Qwen-VL style
 * models, so a 512px photo is ~330 tokens while 1024px is ~1300. On-device models run a 1-2k window,
 * hosted models can afford more detail.
 */
export const IMAGE_MAX_DIMENSION = {
    onDevice: 512,
    external: 1024,
} as const;
/** JPEG quality applied by the picker after scaling (0-1). */
const IMAGE_QUALITY = 0.8;

export type ImageSource = 'gallery' | 'camera';

export interface Attachment {
    uuid: string;
    type: string;
    uri: string;
    name: string;
    size: number;
    content: string | null;
    processing: boolean;
    /**
     * `document` attachments are parsed and embedded into the workspace vector store (files).
     * `image` attachments ride along with the prompt as a base64 data URL in `contentString`.
     */
    kind: 'document' | 'image';
    contentString?: string;
}

export interface AttachmentInterface {
    attachments: Attachment[];
    /** The image attachments in the shape providers expect - pass these to `submitPrompt` */
    imageAttachments: IAttachment[];
    addAttachment: (attachment: Attachment) => void;
    removeAttachment: (attachment: Attachment) => Promise<void>;
    clearAttachments: () => void;
    renderAttachments: () => React.ReactNode;
    askForAttachment: () => void;
    /**
     * Pick one or more images from the gallery (up to the free attachment slots) or take a photo,
     * each downscaled to `maxDimension` px on its longest edge.
     */
    askForImage: (source: ImageSource, options?: { maxDimension?: number }) => Promise<void>;
    clearWorkspaceVectors: () => Promise<void>;
    isMaxAttachments: boolean;
}

export default function useAttachments(wsSlug: string): AttachmentInterface {
    const embedder = getEmbedder('native');
    const deviceInfo = getCurrentDeviceInfo();
    const [workspaceSlug, setWorkspaceSlug] = useState(wsSlug);
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    /** uuid of the image chip currently open in the lightbox */
    const [previewUuid, setPreviewUuid] = useState<string | null>(null);
    // Latest attachments for callbacks that must not re-create on every change (picker limits).
    const attachmentsRef = useRef(attachments);
    useEffect(() => { attachmentsRef.current = attachments; }, [attachments]);
    const addAttachment = useCallback((attachment: Attachment) => {
        setAttachments(prev => [...prev, attachment]);
    }, []);

    const removeAttachment = useCallback(async (attachment: Attachment) => {
        setAttachments(prev => prev.filter(a => a.uuid !== attachment.uuid));
        if (attachment.kind === 'image') return; // images are never embedded - nothing to clean up
        await Document.delete([{ field: 'uuid', value: attachment.uuid }], true); // delete the document and the vectors associated with it
    }, []);

    const clearAttachments = useCallback(async () => {
        const currentAttachments = attachments;
        setAttachments([]);
        await Promise.all(currentAttachments.map(a => removeAttachment(a)));
    }, []);

    /**
     * Blindly clears the workspace vectors and deletes the documents
     * associated with the workspace. This is used when the user wants to
     * clear the workspace vectors and start fresh.
     */
    const onClearWorkspaceVectors = useCallback(async () => {
        setAttachments([]);
        await VectorDB.resetVectorsForWorkspace(workspaceSlug);
        await Document.delete([{ field: 'workspace_slug', value: workspaceSlug }]);
        showToast('Workspace vectors cleared');
    }, []);

    const clearWorkspaceVectors = useCallback(async () => {
        Alert.alert(
            'Clear Workspace Vectors',
            'Are you sure you want to clear the vectors for this workspace? This will remove all vectors for this workspace and cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Clear', style: 'destructive', onPress: onClearWorkspaceVectors }
        ]);
    }, []);

    /**
     * Process an attachment and add it to the attachments array
     * @notice On Android The user MUST select the file from the real folder,
     * if they use the "recent files" the URI will be auto-formatted to the correct
     * format, BUT it will still fail to read the file since the permissions are
     * not granted to the app for the current session.
     *
     * If they use the file directly from the file manager, then subsequent
     * attempts from recent files will work. Weird, idk.
     * @param attachment - The attachment to process
     */
    const processAttachment = useCallback(async (attachment: Attachment) => {
        let temporaryFilePath: string | null = null;
        if (!attachment.uri) return;
        try {
            uiStore.emitter.emit(CHAT_HANDLER_EVENTS.DISABLE_PROMPT_INPUT);

            /**
             * On Android, if the API level is less than 29, we need to copy the file to the temporary directory
             * because the file URI is not valid for the app to read - this mainly happens on newer devices that have no real file manager
             * eg: QRD device for android 16 (API 36) at this time cannot be used to read the file. We can always copy the file and then
             * read it directly since the file will then be app-owned so we can process it.
             *
             * The temporary file is removed after the attachment is processed. This workaround is not needed for Android 15 (API 35) and below.
             */
            if (deviceInfo.isAndroid) {
                console.log(`Android device detected, using copy file workaround...`);
                await RNFS.mkdir(RNFS.TemporaryDirectoryPath + '/uploads');
                temporaryFilePath = `${RNFS.TemporaryDirectoryPath}/uploads/${attachment.uuid}-${attachment.name}`;
                await RNFS.copyFile(attachment.uri, temporaryFilePath);
                attachment.uri = temporaryFilePath;
                console.log(`Temporary file created: ${temporaryFilePath}`);
            }

            const realPath = await Storage.getRealPathFromUri(attachment.uri).catch((e) => {
                console.log('error', e);
                throw new Error('Attachment could not be found');
            });

            const result = await extractTextContentFromFile(realPath, attachment.type);
            if (!result) throw new Error('Attachment content was empty or could not be read');

            // Store the attachment as a plain text file in the local folder with the same name
            // but as text/plain so that it can be read as plain text later on but refer to it as
            // the original filename.
            await storeProcessedFileAsText(attachment.name, result);

            // Embed the processed file
            const document = await embedder
                .splitAndEmbed(result, { chunkSize: 2048, chunkOverlap: 20 })
                .then(embedResults => embedResults.map(embedResult => {
                    const metadata = { ...embedResult.metadata, name: attachment.name };
                    return { embedding: embedResult.embedding, metadata };
                }))
                .then(async (embeddings) => await VectorDB.bulkInsert(workspaceSlug, embeddings))
                .then(async ({ ids }) => {
                    return await Document.create({
                        name: attachment.name,
                        workspaceSlug: workspaceSlug,
                        vectorBoxIds: ids,
                    });
                });

            if (!document) throw new Error('Failed to create document for attachment');
            const newAttachment: Attachment = {
                ...attachment,
                content: result,
                processing: false,
                uuid: document.uuid, // update the attachment with the new uuid so we can manage the DB record associated with it
            };
            setAttachments(prev => prev.map(a => a.uuid === attachment.uuid ? newAttachment : a));
            Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.DOCUMENT_IMPORTED, { documentType: attachment.type });
        } catch (e) {
            showToast((e as Error).message);
            removeAttachment(attachment);
        } finally {
            uiStore.emitter.emit(CHAT_HANDLER_EVENTS.ENABLE_PROMPT_INPUT);
            if (temporaryFilePath && await RNFS.exists(temporaryFilePath)) {
                console.log('Removing temporary file:', temporaryFilePath);
                await RNFS.unlink(temporaryFilePath);
            }
        }
    }, []);

    const extractTextContentFromFile = useCallback(async (fileStoragePath: string, mimeType: string): Promise<string | null> => {
        let result: string | null = null;
        try {
            switch (mimeType) {
                case 'application/pdf':
                    result = (await PDFParser.extract(fileStoragePath))?.textContent || null;
                    break;
                default:
                    const stats = await RNFS.stat(fileStoragePath).catch((e) => {
                        console.log('error', e);
                        throw new Error('Attachment could not be read');
                    });
                    result = await RNFS.read(fileStoragePath, stats.size, 0, 'utf8');
                    break;
            }
            return result;
        } catch (e) {
            console.log('error', e);
            return null;
        }
    }, []);

    const askForAttachment = useCallback(async () => {
        const result = await pick({
            allowMultiSelection: false,
            type: ['text/plain', 'application/pdf', 'text/markdown'],
        });
        if (result.length === 0) return;
        const attachment = result[0];
        const attachmentObject: Attachment = {
            uuid: generateUUID(),
            type: attachment.type || 'text/plain',
            uri: decodeURI(attachment.uri),
            name: attachment.name || 'attachment',
            size: attachment.size || 0,
            content: null,
            processing: true,
            kind: 'document',
        };
        addAttachment(attachmentObject);
        await processAttachment(attachmentObject);
    }, []);

    /**
     * Android only asks for CAMERA at runtime when the permission is declared in the manifest, which
     * ours is (QR scanning). The image picker will throw without it, so request it up front.
     */
    const ensureCameraPermission = useCallback(async (): Promise<boolean> => {
        if (!deviceInfo.isAndroid) return true; // iOS prompts on first use via NSCameraUsageDescription
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
            title: 'Camera access',
            message: 'AnythingLLM needs the camera to take a photo for your prompt.',
            buttonPositive: 'Allow',
            buttonNegative: 'Cancel',
        });
        return granted === PermissionsAndroid.RESULTS.GRANTED;
    }, [deviceInfo.isAndroid]);

    const askForImage = useCallback(async (source: ImageSource, { maxDimension = IMAGE_MAX_DIMENSION.external }: { maxDimension?: number } = {}) => {
        try {
            const remaining = MAX_ATTACHMENTS - attachmentsRef.current.length;
            if (remaining <= 0) return showToast(`You can attach up to ${MAX_ATTACHMENTS} items per prompt`);

            // maxWidth/maxHeight scale the image down proportionally (aspect ratio is preserved)
            // and includeBase64 gives us the scaled bytes without touching the file system.
            // llama.rn and the hosted providers all take several images per message, so the gallery
            // lets the user pick as many as there are free slots.
            const common: ImageLibraryOptions & CameraOptions = {
                mediaType: 'photo',
                includeBase64: true,
                maxWidth: maxDimension,
                maxHeight: maxDimension,
                quality: IMAGE_QUALITY,
                selectionLimit: remaining,
            };

            let result;
            if (source === 'camera') {
                if (!(await ensureCameraPermission())) return showToast('Camera permission is required to take a photo');
                result = await launchCamera({ ...common, cameraType: 'back', saveToPhotos: false });
            } else {
                result = await launchImageLibrary(common);
            }

            if (result.didCancel) return;
            if (result.errorCode) throw new Error(result.errorMessage || `Could not open the ${source === 'camera' ? 'camera' : 'gallery'}`);
            const assets = (result.assets ?? []).slice(0, remaining);
            const readable = assets.filter((asset) => !!asset.base64);
            if (!readable.length) throw new Error('The selected image could not be read');
            if (readable.length < assets.length) showToast(`${assets.length - readable.length} image(s) could not be read and were skipped`);

            const picked: Attachment[] = readable.map((asset, i) => {
                const mime = asset.type || 'image/jpeg';
                const name = asset.fileName || `${source === 'camera' ? 'photo' : 'image'}-${Date.now()}-${i + 1}.${mime.split('/')[1] || 'jpg'}`;
                return {
                    uuid: generateUUID(),
                    type: mime,
                    uri: asset.uri || '',
                    name,
                    size: asset.fileSize || 0,
                    content: null,
                    processing: false,
                    kind: 'image',
                    contentString: `data:${mime};base64,${asset.base64}`,
                };
            });
            setAttachments(prev => [...prev, ...picked]);
            Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.IMAGE_ATTACHED, { source, maxDimension, count: picked.length });
        } catch (e) {
            console.log('askForImage error', e);
            showToast((e as Error).message || 'Could not attach image');
        }
    }, [ensureCameraPermission]);

    const renderAttachments = useCallback(() => {
        if (attachments.length === 0) return null;
        const images = attachments.filter(a => a.kind === 'image' && !!a.contentString);
        const previewIndex = previewUuid ? images.findIndex(a => a.uuid === previewUuid) : -1;
        return (
            <ScrollView
                horizontal={true}
                showsHorizontalScrollIndicator={false}
                className="px-2"
            >
                <View className="flex flex-row gap-x-2">
                    {attachments.map((attachment) => {
                        const isProcessing = attachment.processing;
                        const isImage = attachment.kind === 'image' && !!attachment.contentString;
                        return (
                            <TouchableOpacity
                                key={attachment.uuid}
                                disabled={isProcessing}
                                style={{
                                    height: 40,
                                    paddingHorizontal: isImage ? 6 : 14,
                                    maxWidth: 250,
                                    ...(isProcessing ? {
                                        backgroundColor: 'transparent',
                                        borderWidth: 1,
                                        borderColor: '#6F6F71'
                                    } : {
                                        backgroundColor: '#333333'
                                    }),
                                }}
                                className="flex flex-row gap-x-2 items-center rounded-full justify-center"
                                onPress={() => {
                                    // Images open in the lightbox (which offers remove); documents ask to remove directly.
                                    if (isImage) return setPreviewUuid(attachment.uuid);
                                    Alert.alert('Remove Attachment', 'Are you sure you want to remove this attachment from chat?', [
                                        { text: 'Cancel', style: 'cancel' },
                                        { text: 'Remove', style: 'destructive', onPress: () => removeAttachment(attachment) }
                                    ]);
                                }}
                            >
                                {isProcessing && <ActivityIndicator size="small" color="#fff" />}
                                {isImage && (
                                    <Image
                                        source={{ uri: attachment.contentString }}
                                        style={{ width: 28, height: 28, borderRadius: 14 }}
                                        resizeMode="cover"
                                    />
                                )}
                                <Text numberOfLines={1} ellipsizeMode="middle" className="text-white" style={isImage ? { paddingRight: 8 } : undefined}>{attachment.name}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
                <ImageLightbox
                    images={images.map(a => ({ name: a.name, mime: a.type, contentString: a.contentString as string }))}
                    index={previewIndex >= 0 ? previewIndex : null}
                    onClose={() => setPreviewUuid(null)}
                    onRemove={(_image, index) => { const target = images[index]; if (target) removeAttachment(target); }}
                />
            </ScrollView>
        );
    }, [attachments, previewUuid, removeAttachment]);

    useEffect(() => {
        setWorkspaceSlug(wsSlug);
    }, [wsSlug]);

    useEffect(() => {
        uiStore.emitter.addListener(CHAT_HANDLER_EVENTS.PROMPT_SUBMITTED, () => setAttachments([]));
        uiStore.emitter.addListener(CHAT_HANDLER_EVENTS.CLEAR_ATTACHMENTS, () => setAttachments([]));
        return () => {
            uiStore.emitter.removeAllListeners(CHAT_HANDLER_EVENTS.PROMPT_SUBMITTED);
            uiStore.emitter.removeAllListeners(CHAT_HANDLER_EVENTS.CLEAR_ATTACHMENTS);
        };
    }, [setAttachments]);

    const imageAttachments = useMemo<IAttachment[]>(() => {
        return attachments
            .filter(a => a.kind === 'image' && !!a.contentString)
            .map(a => ({ name: a.name, mime: a.type, contentString: a.contentString as string }));
    }, [attachments]);

    const attachmentInterface = useMemo(() => {
        return {
            attachments,
            imageAttachments,
            addAttachment,
            removeAttachment,
            clearAttachments,
            renderAttachments,
            askForAttachment,
            askForImage,
            clearWorkspaceVectors,
            isMaxAttachments: attachments.length >= MAX_ATTACHMENTS
        }
    }, [attachments, imageAttachments, addAttachment, removeAttachment, clearAttachments, renderAttachments, askForAttachment, askForImage, clearWorkspaceVectors]);

    return attachmentInterface;
}

const ATTACHMENTS_SECTION_HEIGHT = 40; // height for the attachment items and the bottom padding
export function ChatWindowAttachmentsContainer({ attachmentHandler }: { attachmentHandler: AttachmentInterface }) {
    const insets = useSafeAreaInsets();
    const getTopPosition = useCallback(() => {
        const snapPoint = parseInt(snapPointsDefault[0]) / 100;
        return screenDimensions.height - (screenDimensions.height * snapPoint) - insets.top - ATTACHMENTS_SECTION_HEIGHT;
    }, [insets.bottom]);

    return (
        <View style={{ position: 'absolute', zIndex: 2, left: 0, top: getTopPosition(), height: ATTACHMENTS_SECTION_HEIGHT + 10 }}>
            {attachmentHandler.renderAttachments()}
        </View>
    );
}
