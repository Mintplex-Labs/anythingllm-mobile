import { View, Alert, ScrollView, PermissionsAndroid } from "react-native";
import { useState, useCallback, useMemo, useEffect, useRef, createContext, useContext } from "react";
import { generateUUID, getCurrentDeviceInfo, screenDimensions, } from "@/utils/constants";
import * as RNFS from '@dr.pogodin/react-native-fs';
import Storage from "@/utils/storage";
import { pick, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import { launchCamera, launchImageLibrary, type ImageLibraryOptions, type CameraOptions } from 'react-native-image-picker';
import getEmbedder from "@/utils/Embedder";
import VectorDB from "@/utils/VectorDB";
import Document from "@/database/models/Document";
import { showToast } from "@/utils/Notification";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { snapPointsDefault } from "@/screens/WorkspaceChat/PromptInput";
import { CHAT_HANDLER_EVENTS } from "@/hooks/useChatHandler";
import uiStore from "@/store/UIStore";
import DocumentParser from "@/utils/DocumentParser";
import { storeProcessedFileAsText } from "@/utils/fs";
import { removePickerTempFile } from "@/utils/fs/cleanup";
import Telemetry from "@/utils/Telemetry";
import { type IAttachment } from "@/utils/AiProviders/baseOpenAILikeProvider";
import { ImageLightbox } from "@/components/ImageAttachmentGrid";
import AttachmentChip, { ATTACHMENT_CHIP_HEIGHT } from "@/components/AttachmentChip";
import AwaitableAlert from "@/components/AwaitableAlert";
import useLlmPreference from "@/hooks/useLLMPreference";
import OnDeviceProvider from "@/utils/AiProviders/onDevice";
import { providerDisplayName } from "@/utils/llmproviders";
import { estimateTokens, formatTokenEstimate, isLargeDocument } from "@/utils/documents/fullContext";
import { consumePendingShare, prepareSharedImage, removeSharedFile, sharedItemPath, SHARED_CONTENT_READY, type SharedAttachable, type SharedFileItem, type SharedUrlItem } from "@/utils/SharedContent";
import { readUrlAsDocument } from "@/utils/ToolsManager/tools/webScraping";

const MAX_ATTACHMENTS = 4;

/**
 * How a document attachment reaches the model:
 *  - `embed`: chunked and embedded into the workspace vector store, retrieved per prompt (on-device).
 *  - `full`: stored as text only and sent whole in the system prompt on every turn (external providers).
 * See utils/documents/fullContext for the reasoning.
 */
export type DocumentAttachmentMode = 'embed' | 'full';

/** Thrown to abandon an attachment without showing an error (the user declined a warning). */
class AttachmentCancelled extends Error {
    constructor() {
        super('Attachment cancelled');
        this.name = 'AttachmentCancelled';
    }
}

/**
 * Whether images shared to the app can be attached for the current provider/model. Mirrors
 * `useVisionSupport`: external providers are assumed capable, on-device needs a vision model with
 * its projector downloaded.
 */
async function sharedImagesSupported(provider?: string, model?: string): Promise<boolean> {
    if (!provider || provider === 'unknown' || !model) return false;
    if (provider !== 'native') return true;
    return await OnDeviceProvider.modelSupportsVision(model).catch(() => false);
}

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
     * `document` attachments are parsed into the workspace (files) - embedded for on-device models,
     * kept whole for external providers (see `DocumentAttachmentMode`).
     * `image` attachments ride along with the prompt as a base64 data URL in `contentString`.
     */
    kind: 'document' | 'image';
    contentString?: string;
    /** Set for documents the web scraper made from a shared link, so the UI can call it a website. */
    origin?: 'url';
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
    /**
     * Attach files and images another app shared to AnythingLLM (see utils/SharedContent). Documents
     * are created in `targetWorkspaceSlug`, which travels with the share so they land in the right
     * workspace even while this screen's route params are still catching up with the navigation.
     */
    addSharedItems: (items: SharedAttachable[], target: { wsSlug: string; threadSlug: string }) => Promise<void>;
    /** How document attachments reach the model with the currently selected provider */
    documentMode: DocumentAttachmentMode;
    clearWorkspaceVectors: () => Promise<void>;
    isMaxAttachments: boolean;
}

/**
 * Lets components inside the chat screen that do not receive the handler as a prop (eg: the
 * empty-thread suggestions) see what is attached. Provided by the WorkspaceChat screen; null elsewhere.
 */
const AttachmentsContext = createContext<AttachmentInterface | null>(null);
export const AttachmentsProvider = AttachmentsContext.Provider;
export function useAttachmentsContext(): AttachmentInterface | null {
    return useContext(AttachmentsContext);
}

export default function useAttachments(wsSlug: string, threadSlug: string | null = null): AttachmentInterface {
    const embedder = getEmbedder('native');
    const deviceInfo = getCurrentDeviceInfo();
    const { LLMProvider, llmPreferences, isLoading: isLoadingProvider } = useLlmPreference();
    const [workspaceSlug, setWorkspaceSlug] = useState(wsSlug);
    // The chat screen keeps this hook instance across param changes, so callbacks created once read the slug from a ref.
    const workspaceSlugRef = useRef(wsSlug);
    const threadSlugRef = useRef(threadSlug);
    // On-device embeds (RAG); every external provider gets the whole document instead.
    const documentMode: DocumentAttachmentMode = LLMProvider?.isExternalProvider ? 'full' : 'embed';
    const providerRef = useRef({ documentMode, provider: llmPreferences?.provider as string | undefined, model: llmPreferences?.config?.model as string | undefined });
    useEffect(() => {
        providerRef.current = { documentMode, provider: llmPreferences?.provider, model: llmPreferences?.config?.model };
    }, [documentMode, llmPreferences?.provider, llmPreferences?.config?.model]);
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
     *
     * What happens to the parsed text depends on the selected provider (`DocumentAttachmentMode`):
     * on-device models get it chunked and embedded for retrieval, external providers get the whole
     * document in every prompt - after a warning when it is very large.
     * @param attachment - The attachment to process
     * @param target - Workspace (and thread, for full-context scoping) the document belongs to. Defaults to the open chat.
     * @param extract - Produces the document text. Defaults to parsing the file at `attachment.uri`;
     *   shared links pass a scraper instead (see `addSharedItems`).
     */
    const processAttachment = useCallback(async (
        attachment: Attachment,
        target: { wsSlug: string; threadSlug: string | null } = { wsSlug: workspaceSlugRef.current, threadSlug: threadSlugRef.current },
        extract?: () => Promise<string>,
    ) => {
        const targetWorkspaceSlug = target.wsSlug;
        let temporaryFilePath: string | null = null;
        if (!attachment.uri && !extract) return;
        try {
            uiStore.emitter.emit(CHAT_HANDLER_EVENTS.DISABLE_PROMPT_INPUT);

            const extractFromFile = async () => {
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

                // Throws UnsupportedDocumentError / a descriptive Error which surfaces as the toast below.
                return await DocumentParser.extractText(realPath, attachment.name, attachment.type);
            };

            const result = await (extract ? extract() : extractFromFile());
            if (!result?.trim()) throw new Error('Attachment content was empty or could not be read');

            const { documentMode: mode, provider } = providerRef.current;
            if (mode === 'full' && isLargeDocument(result)) {
                // The whole file rides along with every prompt in this workspace - make sure the user wants that.
                const providerName = provider ? providerDisplayName(provider) : 'your model provider';
                const proceed = await AwaitableAlert(
                    'Large document',
                    `"${attachment.name}" is roughly ${formatTokenEstimate(estimateTokens(result))} tokens. With ${providerName} the whole document is sent with every message in this workspace, which can be slow and costly. Attach it anyway?`,
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Attach', style: 'default' },
                );
                if (!proceed) throw new AttachmentCancelled();
            }

            // Store the attachment as a plain text file in the local folder with the same name
            // but as text/plain so that it can be read as plain text later on but refer to it as
            // the original filename.
            await storeProcessedFileAsText(attachment.name, result);

            let document: Awaited<ReturnType<typeof Document.create>>;
            if (mode === 'full') {
                // External provider: nothing to embed. An empty vector id list marks the document as
                // "send in full" - the provider reads the processed text back on every prompt in this
                // thread only, so documents from different conversations never pile up together.
                document = await Document.create({
                    name: attachment.name,
                    workspaceSlug: targetWorkspaceSlug,
                    threadSlug: target.threadSlug,
                    vectorBoxIds: [],
                });
            } else {
                // On-device: chunk and embed so the small context window only ever sees relevant pieces.
                document = await embedder
                    .splitAndEmbed(result, { chunkSize: 2048, chunkOverlap: 20 })
                    .then(embedResults => embedResults.map(embedResult => {
                        const metadata = { ...embedResult.metadata, name: attachment.name };
                        return { embedding: embedResult.embedding, metadata };
                    }))
                    .then(async (embeddings) => await VectorDB.bulkInsert(targetWorkspaceSlug, embeddings))
                    .then(async ({ ids }) => {
                        return await Document.create({
                            name: attachment.name,
                            workspaceSlug: targetWorkspaceSlug,
                            vectorBoxIds: ids,
                        });
                    });
            }

            if (!document) throw new Error('Failed to create document for attachment');
            const newAttachment: Attachment = {
                ...attachment,
                content: result,
                processing: false,
                uuid: document.uuid, // update the attachment with the new uuid so we can manage the DB record associated with it
            };
            setAttachments(prev => prev.map(a => a.uuid === attachment.uuid ? newAttachment : a));
            Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.DOCUMENT_IMPORTED, { documentType: attachment.type, mode: mode === 'full' ? 'full' : 'embedded' });
        } catch (e) {
            if (!(e instanceof AttachmentCancelled)) showToast((e as Error).message);
            removeAttachment(attachment);
        } finally {
            uiStore.emitter.emit(CHAT_HANDLER_EVENTS.ENABLE_PROMPT_INPUT);
            if (temporaryFilePath && await RNFS.exists(temporaryFilePath)) {
                console.log('Removing temporary file:', temporaryFilePath);
                await RNFS.unlink(temporaryFilePath);
            }
        }
    }, []);

    const askForAttachment = useCallback(async () => {
        let result: Awaited<ReturnType<typeof pick>>;
        try {
            result = await pick({
                allowMultiSelection: false,
                type: DocumentParser.PICKER_FILE_TYPES, // mime types on Android, UTIs on iOS
            });
        } catch (e) {
            // The picker rejects when the user backs out of the system dialog; that is not an error.
            if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) return;
            throw e;
        }
        if (result.length === 0) return;
        const attachment = result[0];
        // Prefer the mime type derived from the extension: Android providers often report
        // application/octet-stream (or null) for markdown, csv and similar files.
        const resolved = DocumentParser.resolveDocument(attachment.name, attachment.type);
        const attachmentObject: Attachment = {
            uuid: generateUUID(),
            type: resolved?.mimeType || attachment.type || 'application/octet-stream',
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
            const allAssets = result.assets ?? [];
            const assets = allAssets.slice(0, remaining);
            const readable = assets.filter((asset) => !!asset.base64);
            // The picker writes a downscaled copy of every image to the cache dir (rn_image_picker_*).
            // We only keep the base64 it handed us, so drop those files right away.
            await Promise.all(allAssets.map((asset) => removePickerTempFile(asset.uri)));
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

    const addSharedItems = useCallback(async (items: SharedAttachable[], target: { wsSlug: string; threadSlug: string }) => {
        const remaining = Math.max(0, MAX_ATTACHMENTS - attachmentsRef.current.length);
        const accepted = items.slice(0, remaining);
        const skipped = items.slice(accepted.length);
        if (skipped.length) showToast(`You can attach up to ${MAX_ATTACHMENTS} items per prompt - ${skipped.length} skipped`, 'long');
        await Promise.all(skipped.filter((item): item is SharedFileItem => item.kind !== 'url').map(removeSharedFile));

        const images = accepted.filter((item): item is SharedFileItem => item.kind === 'image');
        const files = accepted.filter((item): item is SharedFileItem => item.kind === 'file');
        const urls = accepted.filter((item): item is SharedUrlItem => item.kind === 'url');

        // Links are read with the web scraper (pages as text, document links parsed) and stored like a file.
        for (const { url } of urls) {
            let hostname = url;
            try { hostname = new URL(url).hostname; } catch { /* keep the raw url as the label */ }
            const attachment: Attachment = {
                uuid: generateUUID(),
                type: 'text/markdown',
                uri: '',
                name: `${hostname}.md`,
                size: 0,
                content: null,
                processing: true,
                kind: 'document',
                origin: 'url',
            };
            addAttachment(attachment);
            await processAttachment(attachment, target, async () => {
                const page = await readUrlAsDocument(url, (status) => console.log(`[SharedContent] ${status}`));
                const title = page.title?.trim() || hostname;
                // Name the document after the page so it reads well in the Files list and in citations.
                attachment.name = `${title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)}.md`;
                setAttachments(prev => prev.map(a => a.uuid === attachment.uuid ? { ...a, name: attachment.name } : a));
                return `# ${title}\n\nSource: ${page.url}\n\n${page.content}`;
            });
        }

        if (images.length) {
            const { provider, model } = providerRef.current;
            if (!(await sharedImagesSupported(provider, model))) {
                showToast(`Your current model cannot read images - ${images.length} image${images.length === 1 ? ' was' : 's were'} skipped`, 'long');
            } else {
                // Same sizing rules as the gallery picker: on-device images share a 1-2k token window.
                const maxDimension = provider === 'native' ? IMAGE_MAX_DIMENSION.onDevice : IMAGE_MAX_DIMENSION.external;
                const prepared: Attachment[] = [];
                for (const image of images) {
                    try {
                        const { base64, mime } = await prepareSharedImage(image.uri, { maxDimension, quality: IMAGE_QUALITY });
                        prepared.push({
                            uuid: generateUUID(),
                            type: mime,
                            uri: image.uri,
                            name: image.name,
                            size: image.size || 0,
                            content: null,
                            processing: false,
                            kind: 'image',
                            contentString: `data:${mime};base64,${base64}`,
                        });
                    } catch (e) {
                        console.log('shared image could not be prepared', image.name, e);
                        showToast(`Could not read ${image.name}`);
                    }
                }
                if (prepared.length) {
                    setAttachments(prev => [...prev, ...prepared]);
                    Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.IMAGE_ATTACHED, { source: 'share', maxDimension, count: prepared.length });
                }
            }
            await Promise.all(images.map(removeSharedFile));
        }

        for (const file of files) {
            const resolved = DocumentParser.resolveDocument(file.name, file.mimeType);
            const attachment: Attachment = {
                uuid: generateUUID(),
                type: resolved?.mimeType || file.mimeType || 'application/octet-stream',
                uri: sharedItemPath(file),
                name: file.name || 'attachment',
                size: file.size || 0,
                content: null,
                processing: true,
                kind: 'document',
            };
            addAttachment(attachment);
            // Unsupported types and parse failures surface as a toast inside processAttachment.
            await processAttachment(attachment, target);
            await removeSharedFile(file);
        }
    }, [addAttachment, processAttachment]);

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
                        const isImage = attachment.kind === 'image' && !!attachment.contentString;
                        const confirmRemove = () => Alert.alert('Remove Attachment', 'Are you sure you want to remove this attachment from chat?', [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Remove', style: 'destructive', onPress: () => removeAttachment(attachment) }
                        ]);
                        return (
                            <AttachmentChip
                                key={attachment.uuid}
                                name={attachment.name}
                                size={attachment.size}
                                processing={attachment.processing}
                                imageUri={isImage ? attachment.contentString : undefined}
                                // Images open in the lightbox (which also offers remove); documents have no preview.
                                onPress={isImage ? () => setPreviewUuid(attachment.uuid) : undefined}
                                // Images are cheap to re-add; documents were parsed and embedded, so confirm first.
                                onRemove={isImage ? () => removeAttachment(attachment) : confirmRemove}
                            />
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
        workspaceSlugRef.current = wsSlug;
        threadSlugRef.current = threadSlug;
    }, [wsSlug, threadSlug]);

    // Content shared from another app is stashed for one specific thread and only the screen showing
    // that thread attaches it. Wait for the provider preference so documents take the right route
    // (embed vs full) - the stash keeps until then.
    useEffect(() => {
        if (isLoadingProvider) return;
        const consume = () => {
            const pending = consumePendingShare(wsSlug, threadSlug);
            if (!pending) return;
            addSharedItems(pending.items, { wsSlug: pending.wsSlug, threadSlug: pending.threadSlug }).catch((e) => {
                console.log('shared content could not be attached', e);
                showToast('Could not attach the shared content');
            });
        };
        consume();
        const subscription = uiStore.emitter.addListener(SHARED_CONTENT_READY, consume);
        return () => subscription.remove();
    }, [wsSlug, threadSlug, isLoadingProvider, addSharedItems]);

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
            addSharedItems,
            documentMode,
            clearWorkspaceVectors,
            isMaxAttachments: attachments.length >= MAX_ATTACHMENTS
        }
    }, [attachments, imageAttachments, addAttachment, removeAttachment, clearAttachments, renderAttachments, askForAttachment, askForImage, addSharedItems, documentMode, clearWorkspaceVectors]);

    return attachmentInterface;
}

const ATTACHMENTS_SECTION_HEIGHT = ATTACHMENT_CHIP_HEIGHT; // height of one chip row; the container adds bottom padding
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
