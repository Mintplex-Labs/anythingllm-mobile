import { Text, TouchableOpacity, View, Alert } from "react-native";
import { useState, useCallback, useMemo } from "react";
import { generateUUID, } from "@/utils/constants";
import { CircleNotch, FileText, Spinner } from "phosphor-react-native";
import * as RNFS from '@dr.pogodin/react-native-fs';
import { NativeEventEmitter } from "react-native";
import Storage from "@/utils/storage";
import { pick } from 'react-native-document-picker';

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
}

export default function useAttachments(): AttachmentInterface {
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
            askForAttachment
        }
    }, [attachments, addAttachment, removeAttachment, clearAttachments, renderAttachments, askForAttachment]);

    return attachmentInterface;
}