import { memo, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Text, TouchableOpacity, View } from "react-native";
import { Check, DownloadSimple, FileDashed, ShareNetwork } from "phosphor-react-native";
import { type IAgentAction, type IFileDownloadAction } from "@/database/models/WorkspaceChat";
import { fileTypeForFilename } from "@/utils/documents/shared";
import { generatedDocumentExists, generatedDocumentPath } from "@/utils/fs/generatedDocuments";
import { copyToDeviceDownloads, shareDeviceFile } from "@/utils/fs/deviceDownloads";
import { formatBytes } from "@/utils/formatters";
import { showToast } from "@/utils/Notification";

/**
 * Native port of the desktop `FileDownloadCard`
 * (frontend/src/components/WorkspaceChat/ChatContainer/ChatHistory/FileDownloadCard).
 *
 * One card per file the assistant generated in this turn, rendered full width under the reply
 * and persisted with the message as a `file_download` action. The file lives in the app's
 * generated-documents folder, so the card first checks it is still there: "Clear temporary
 * files" in settings removes the folder and the card then shows a muted "no longer available"
 * state instead of a dead button.
 *
 * "Download" means what the platform means by it: on Android the file is copied to the shared
 * Downloads folder, on iOS the share sheet opens (which offers "Save to Files"). Android also
 * gets a share shortcut.
 */
export default memo(function FileDownloadCards({ actions = [], isLoading = false }: { actions?: IAgentAction[]; isLoading?: boolean }) {
    // The tool reports the file mid-turn, before the model has written its reply. Rendering the
    // card then means the streaming text keeps shoving it down the screen, so hold it until the
    // turn completes - same as citations.
    if (isLoading) return null;
    const files = actions.filter((action): action is IFileDownloadAction => action.type === 'file_download');
    if (files.length === 0) return null;
    return (
        <View style={{ width: '100%', gap: 8 }}>
            {files.map((action, index) => <FileDownloadCard key={`${action.action.storageFilename}-${index}`} action={action} />)}
        </View>
    );
});

const COLORS = {
    /** zinc-800 - same surface as the tool approval card */
    card: '#27272A',
    /** zinc-600 */
    buttonBorder: '#52525B',
    /** zinc-700 */
    missingBadge: '#3F3F46',
    text: '#FFFFFF',
    muted: '#A1A1AA',
    success: '#46C08A',
} as const;

type CardStatus = 'checking' | 'ready' | 'saving' | 'saved' | 'missing';
const SAVED_FEEDBACK_MS = 2500;

function FileDownloadCard({ action }: { action: IFileDownloadAction }) {
    const { title, storageFilename, fileSize, mimeType } = action.action;
    const fileType = fileTypeForFilename(title);
    const [status, setStatus] = useState<CardStatus>('checking');
    const [sharing, setSharing] = useState(false);
    const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        let cancelled = false;
        generatedDocumentExists(storageFilename).then((exists) => {
            if (!cancelled) setStatus(exists ? 'ready' : 'missing');
        });
        return () => {
            cancelled = true;
            if (savedTimer.current) clearTimeout(savedTimer.current);
        };
    }, [storageFilename]);

    /** Re-check right before acting - the file may have been cleared while the card was on screen */
    async function sourcePath(): Promise<string | null> {
        const path = generatedDocumentPath(storageFilename);
        if (!path || !(await generatedDocumentExists(storageFilename))) {
            setStatus('missing');
            return null;
        }
        return path;
    }

    async function handleDownload() {
        if (status !== 'ready' && status !== 'saved') return;
        const path = await sourcePath();
        if (!path) return;
        setStatus('saving');
        try {
            if (Platform.OS === 'android') {
                const saved = await copyToDeviceDownloads({ filename: title, sourcePath: path });
                showToast(`Saved ${saved.filename} to ${saved.locationLabel}`);
                setStatus('saved');
                savedTimer.current = setTimeout(() => setStatus('ready'), SAVED_FEEDBACK_MS);
            } else {
                await shareDeviceFile({ path, filename: title, mimeType });
                setStatus('ready');
            }
        } catch (error: any) {
            console.error('[FileDownloadCard] download failed', error);
            showToast(`Could not save file: ${error?.message ?? 'unknown error'}`, 'long');
            setStatus('ready');
        }
    }

    async function handleShare() {
        if (sharing || status === 'missing' || status === 'checking') return;
        const path = await sourcePath();
        if (!path) return;
        setSharing(true);
        try {
            await shareDeviceFile({ path, filename: title, mimeType });
        } catch (error: any) {
            console.error('[FileDownloadCard] share failed', error);
            showToast(`Could not open share sheet: ${error?.message ?? 'unknown error'}`, 'long');
        } finally {
            setSharing(false);
        }
    }

    const missing = status === 'missing';
    const subtitle = missing
        ? 'No longer on this device'
        : [fileSize > 0 ? formatBytes(fileSize, 1) : null, fileType.label].filter(Boolean).join(' · ');

    return (
        <View
            accessibilityLabel={missing ? `${title}, file no longer available` : `Download ${title}`}
            style={{ width: '100%', backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, gap: 12, opacity: missing ? 0.65 : 1 }}
            className="flex flex-row items-center">
            <View
                style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: missing ? COLORS.missingBadge : fileType.badgeBackground }}
                className="flex items-center justify-center">
                {missing
                    ? <FileDashed size={22} color={COLORS.muted} />
                    : <Text style={{ color: fileType.badgeText, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 }}>{fileType.badge}</Text>}
            </View>

            <View style={{ flex: 1, minWidth: 0 }} className="flex flex-col">
                <Text numberOfLines={1} ellipsizeMode="middle" style={{ color: COLORS.text, fontSize: 14, fontWeight: '500', lineHeight: 18 }}>
                    {title || 'Unknown file'}
                </Text>
                <Text numberOfLines={1} style={{ color: COLORS.muted, fontSize: 12, lineHeight: 16 }}>{subtitle}</Text>
            </View>

            {!missing && (
                <View style={{ gap: 6 }} className="flex flex-row items-center">
                    {Platform.OS === 'android' && (
                        <TouchableOpacity
                            onPress={handleShare}
                            disabled={sharing || status === 'checking' || status === 'saving'}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            accessibilityLabel={`Share ${title}`}
                            style={{ width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: COLORS.buttonBorder, opacity: sharing ? 0.6 : 1 }}
                            className="flex items-center justify-center">
                            {sharing ? <ActivityIndicator size="small" color={COLORS.text} /> : <ShareNetwork size={16} color={COLORS.text} weight="bold" />}
                        </TouchableOpacity>
                    )}
                    <DownloadButton status={status} onPress={handleDownload} />
                </View>
            )}
        </View>
    );
}

function DownloadButton({ status, onPress }: { status: CardStatus; onPress: () => void }) {
    const busy = status === 'checking' || status === 'saving';
    const saved = status === 'saved';
    const label = status === 'saving' ? 'Saving...' : saved ? 'Saved' : 'Download';
    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={busy}
            activeOpacity={0.7}
            style={{ gap: 6, paddingHorizontal: 12, height: 36, borderRadius: 8, borderWidth: 1, borderColor: saved ? COLORS.success : COLORS.buttonBorder, opacity: busy ? 0.6 : 1 }}
            className="flex flex-row items-center justify-center">
            {busy
                ? <ActivityIndicator size="small" color={COLORS.text} />
                : saved
                    ? <Check size={16} color={COLORS.success} weight="bold" />
                    : <DownloadSimple size={16} color={COLORS.text} weight="bold" />}
            <Text style={{ color: saved ? COLORS.success : COLORS.text, fontSize: 13, fontWeight: '500' }}>{label}</Text>
        </TouchableOpacity>
    );
}
