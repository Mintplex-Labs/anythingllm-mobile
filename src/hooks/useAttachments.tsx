import { Text, TouchableOpacity, View, Alert } from "react-native";
import { useState, useCallback, useMemo, useEffect } from "react";
import { generateUUID, } from "@/utils/constants";
import { CircleNotch, FileText, Spinner } from "phosphor-react-native";
import * as RNFS from '@dr.pogodin/react-native-fs';
import { NativeEventEmitter } from "react-native";
import Storage from "@/utils/storage";
import { pick } from 'react-native-document-picker';
import getEmbedder from "@/utils/Embedder";
import VectorDB from "@/utils/VectorDB";

const eventEmitter = new NativeEventEmitter();
export interface Attachment {
    uuid: string;
    type: string;
    uri: string;
    name: string;
    size: number;
    content: string | null;
    processing: boolean;
}

export interface AttachmentInterface {
    attachments: Attachment[];
    addAttachment: (attachment: Attachment) => void;
    removeAttachment: (attachment: Attachment) => void;
    clearAttachments: () => void;
    renderAttachments: () => React.ReactNode;
    askForAttachment: () => void;
    clearWorkspaceVectors: () => Promise<void>;
}

export default function useAttachments(wsSlug: string): AttachmentInterface {
    const embedder = getEmbedder('native');
    const [workspaceSlug, setWorkspaceSlug] = useState(wsSlug);
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const addAttachment = useCallback((attachment: Attachment) => {
        setAttachments(prev => [...prev, attachment]);
    }, []);

    const removeAttachment = useCallback((attachment: Attachment) => {
        setAttachments(prev => prev.filter(a => a.uuid !== attachment.uuid));
    }, []);

    const clearAttachments = useCallback(() => {
        setAttachments([]);
    }, []);

    const onClearWorkspaceVectors = useCallback(async () => {
        setAttachments([]);
        await VectorDB.resetVectorsForWorkspace(workspaceSlug);
        console.log(`Vectors cleared for workspace ${workspaceSlug}`);
    }, []);

    const clearWorkspaceVectors = useCallback(async () => {
        Alert.alert(
            'Clear Workspace Vectors',
            'Are you sure you want to clear the vectors for this workspace? This will remove all vectors for this workspace and cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Clear', style: 'destructive', onPress: onClearWorkspaceVectors }
        ]);
    }, []);

    useEffect(() => {
        setWorkspaceSlug(wsSlug);
        VectorDB.getWorkspaceVectorCount(wsSlug).then(count => {
            console.log(`VectorDB count for workspace ${wsSlug}: ${count}`);
        });
    }, [wsSlug]);

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
        if (!attachment.uri) return;
        try {
            const realPath = await Storage.getRealPathFromUri(attachment.uri).catch((e) => {
                console.log('error', e);
                throw new Error('Attachment could not be found');
            });

            const stats = await RNFS.stat(realPath).catch((e) => {
                console.log('error', e);
                throw new Error('Attachment could not be read');
            });
            const result = await RNFS.read(realPath, stats.size, 0, 'utf8');
            if (!result) throw new Error('Attachment content was empty or could not be read');

            await embedder
                .splitAndEmbed(result, { chunkSize: 2048, chunkOverlap: 20 })
                .then(embedResults => embedResults.map(embedResult => {
                    const metadata = { ...embedResult.metadata, name: attachment.name };
                    return { embedding: embedResult.embedding, metadata };
                }))
                .then(async (embeddings) => await VectorDB.bulkInsert(workspaceSlug, embeddings))
                .then(async (count) => console.log(`Inserted ${count} embeddings into VectorDB - now ${await VectorDB.getWorkspaceVectorCount(workspaceSlug)} vectors in the database`));

            setAttachments(prev => prev.map(a => a.uuid === attachment.uuid ? { ...a, content: result, processing: false } : a));
        } catch (e) {
            eventEmitter.emit('genericSnackbar', (e as Error).message);
            removeAttachment(attachment);
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
        };
        addAttachment(attachmentObject);
        await processAttachment(attachmentObject);
    }, []);

    const renderAttachments = useCallback(() => {
        if (attachments.length === 0) return null;
        return (
            <View className="flex flex-row gap-x-2 top-[-15px]">
                {attachments.map((attachment) => {
                    return (
                        <TouchableOpacity
                            key={attachment.uuid}
                            className="flex flex-row gap-x-2 items-center bg-gray-700 rounded-full py-1 px-3"
                            onPress={() => {
                                Alert.alert('Remove Attachment', 'Are you sure you want to remove this attachment from chat?', [
                                    { text: 'Cancel', style: 'cancel' },
                                    { text: 'Remove', style: 'destructive', onPress: () => removeAttachment(attachment) }
                                ]);
                            }}
                        >
                            {attachment.processing ?
                                <View className="animate-spin"><CircleNotch size={16} color="#fff" /></View> :
                                <FileText size={16} color="#fff" />
                            }
                            <Text className="text-white">{attachment.name}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        );
    }, [attachments]);

    const attachmentInterface = useMemo(() => {
        return {
            attachments,
            addAttachment,
            removeAttachment,
            clearAttachments,
            renderAttachments,
            askForAttachment,
            clearWorkspaceVectors
        }
    }, [attachments, addAttachment, removeAttachment, clearAttachments, renderAttachments, askForAttachment, clearWorkspaceVectors]);

    return attachmentInterface;
}