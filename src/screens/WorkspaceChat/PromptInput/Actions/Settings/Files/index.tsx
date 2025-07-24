import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { Paperclip, DotsThreeCircleVertical, X, FolderSimple } from "phosphor-react-native";
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useBottomSheet, BOTTOM_SHEET_NAMES } from '@/contexts/BottomSheetContext';
import { View, Text, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WorkspaceType } from "@/database/models/Workspace";
import useWorkspaceFiles from "./useWorkspaceFiles";
import FilesListContainer from "./Container";
import Document from "@/database/models/Document";
import { showToast } from "@/utils/Notification";

export default function WorkspaceFilesActionSheet({ workspace }: { workspace: WorkspaceType }) {
    const insets = useSafeAreaInsets();
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const { registerSheet, presentSheet, activeSheet } = useBottomSheet();
    const [optionsActive, setOptionsActive] = useState(false);
    const [selectedFileUuids, setSelectedFileUuids] = useState<string[]>([]);
    const { files, isLoading, error, fetchFiles } = useWorkspaceFiles(workspace.slug, { runOnMount: false });
    const [isDeleting, setIsDeleting] = useState(false);

    function handleSelectAllFiles() {
        setSelectedFileUuids(selectedFileUuids.length === files.length ? [] : files.map((file) => file.uuid));
    }

    async function deleteSelectedFiles() {
        try {
            setIsDeleting(true);
            await Document.deleteByUuids(selectedFileUuids, true);
            showToast(`${selectedFileUuids.length} files deleted successfully!`, 'short');
            setSelectedFileUuids([]);
            await fetchFiles();
        } catch (error) {
            console.error(error);
        } finally {
            setOptionsActive(false);
            setIsDeleting(false);
        }
    }

    useEffect(() => {
        registerSheet(BOTTOM_SHEET_NAMES.WORKSPACE_FILES, bottomSheetRef);
    }, [registerSheet]);

    useEffect(() => {
        // Reset state when sheet is opened
        if (activeSheet === BOTTOM_SHEET_NAMES.WORKSPACE_FILES) {
            setSelectedFileUuids([]);
            setOptionsActive(false);
            fetchFiles();
        }
    }, [activeSheet]);

    return (
        <BottomSheetModal
            ref={bottomSheetRef}
            index={0}
            snapPoints={['100%']}
            enableDynamicSizing={false}
            enablePanDownToClose={true}
            backgroundStyle={{ backgroundColor: '#1B1B1E' }}
            handleIndicatorStyle={{ display: 'none' }}
            onDismiss={() => presentSheet(BOTTOM_SHEET_NAMES.PRIMARY_PROMPT_INPUT, true)}
        >
            <View style={{ paddingHorizontal: 30, paddingBottom: insets.bottom, paddingTop: insets.top, flex: 1 }}>
                <View style={{ marginBottom: 24 }} className='flex w-full flex-row items-center justify-between'>
                    <View className='flex-1'>
                        {optionsActive ? (
                            <TouchableOpacity onPress={handleSelectAllFiles}>
                                <Text style={{ color: '#7cd4fd' }} className='text-lg'>{selectedFileUuids.length === files.length ? 'Deselect All' : 'Select All'}</Text>
                            </TouchableOpacity>
                        ) : null}
                    </View>
                    <Text className='text-white text-xl font-medium'>Files</Text>
                    <View className='flex-1 items-end'>
                        <TouchableOpacity disabled={isDeleting} onPress={() => setOptionsActive(!optionsActive)} className="disabled:opacity-50">
                            {optionsActive ? <X size={24} color="#FFF" /> : <DotsThreeCircleVertical size={24} color="#FFF" />}
                        </TouchableOpacity>
                    </View>
                </View>
                {selectedFileUuids.length > 0 && (
                    <TouchableOpacity
                        disabled={isDeleting}
                        onPress={deleteSelectedFiles}
                        style={{ backgroundColor: 'rgba(122,39,26,0.2)', }} className='flex flex-row items-center justify-center rounded-lg p-4 mb-4'>
                        <Text style={{ color: '#F97066' }} className='text-lg font-medium'>Delete Selected Files</Text>
                    </TouchableOpacity>
                )}
                <FilesListContainer
                    disabled={isDeleting}
                    selectedFileUuids={selectedFileUuids}
                    setSelectedFileUuids={setSelectedFileUuids}
                    files={files}
                    error={error}
                    isLoading={isLoading}
                    optionsActive={optionsActive}
                />
            </View>
        </BottomSheetModal>
    );
}


export function WorkspaceFilesActionButton({ disabled = false }: { disabled: boolean }) {
    const { presentSheet } = useBottomSheet();
    return (
        <TouchableOpacity
            disabled={disabled}
            onPress={() => presentSheet(BOTTOM_SHEET_NAMES.WORKSPACE_FILES)}
            style={{ gap: 11, opacity: disabled ? 0.4 : 1 }}
            className='flex flex-col items-center justify-center'
        >
            <View style={{ backgroundColor: '#3f3f42', width: 52, height: 52 }} className='flex flex-col items-center justify-center rounded-full'>
                <Paperclip size={32} color="#FFF" />
            </View>
            <Text className='text-white text-lg font-medium'>Files</Text>
        </TouchableOpacity>

    );
}