import { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity } from "react-native";
import Document, { DocumentType } from "@/database/models/Document";
import Loading from "./loading";
import Error from "./error";
import Empty from "./empty";
import { Circle, File } from "phosphor-react-native";

interface FilesListContainerProps {
    selectedFileUuids: string[];
    setSelectedFileUuids: React.Dispatch<React.SetStateAction<string[]>>;
    files: DocumentType[];
    /** Thread of the open chat - decides which full-context documents are labelled as active */
    currentThreadSlug?: string | null;
    error: Error | null;
    isLoading: boolean;
    optionsActive: boolean;
    disabled: boolean;
}

export default function FilesListContainer({ selectedFileUuids, setSelectedFileUuids, files, currentThreadSlug = null, error, isLoading, optionsActive, disabled }: FilesListContainerProps) {
    if (isLoading) return <Loading />;
    if (error) return <Error error={error} />;
    if (files.length === 0) return <Empty />;

    // Documents that reach the model from this thread first, then everything else, newest first within each group.
    const sorted = [...files].sort((a, b) => {
        const aActive = !Document.isFullContext(a) || Document.appliesToThread(a, currentThreadSlug);
        const bActive = !Document.isFullContext(b) || Document.appliesToThread(b, currentThreadSlug);
        if (aActive !== bActive) return aActive ? -1 : 1;
        return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    });

    return (
        <FlatList
            data={sorted}
            renderItem={({ item }) => {
                const isSelected = selectedFileUuids.includes(item.uuid);
                return (
                    <FileItem
                        file={item}
                        currentThreadSlug={currentThreadSlug}
                        selected={isSelected}
                        disabled={disabled}
                        onSelect={() => {
                            if (isSelected) setSelectedFileUuids((prev) => prev.filter((uuid) => uuid !== item.uuid));
                            else setSelectedFileUuids((prev) => [...prev, item.uuid]);
                        }}
                    />
                )
            }}
            keyExtractor={(item) => item.uuid}
            className="flex-1"
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#27282A' }} />}
            ListEmptyComponent={<Empty />}
            scrollEnabled={true}
            showsVerticalScrollIndicator={true}
        />
    );
}

interface FileItemProps {
    file: DocumentType;
    currentThreadSlug: string | null;
    selected: boolean;
    onSelect: () => void;
    disabled: boolean;
}

/** "Embedded" documents are searched from every thread; full-context ones only apply to the thread they were attached in. */
function describeDocument(file: DocumentType, currentThreadSlug: string | null): { label: string; active: boolean } {
    if (!Document.isFullContext(file)) return { label: 'Embedded · searched in every thread', active: true };
    if (!file.threadSlug) return { label: 'Sent in full · every thread', active: true };
    if (file.threadSlug === currentThreadSlug) return { label: 'Sent in full · this thread', active: true };
    return { label: 'Sent in full · another thread', active: false };
}

function FileItem({ file, currentThreadSlug, selected, onSelect, disabled }: FileItemProps) {
    const { label, active } = describeDocument(file, currentThreadSlug);
    return (
        <TouchableOpacity
            onPress={onSelect}
            style={{ paddingVertical: 16, }}
            className="flex flex-row items-center justify-between disabled:opacity-50"
            disabled={disabled}
        >
            <View style={{ gap: 8 }} className='flex flex-row items-center justify-start'>
                <View className='relative'>
                    <Circle size={24} color={selected ? '#fff' : '#888'} />
                    {selected && <Circle size={16} color='#36bffa' weight='fill' style={{ position: 'absolute', top: (24 - 16) / 2, left: (24 - 16) / 2 }} />}
                </View>
                <File size={20} color={active ? '#FFF' : '#888'} />
                <View className='flex flex-col shrink'>
                    <Text className="text-lg text-[--primary-text]" numberOfLines={1} style={{ opacity: active ? 1 : 0.6 }}>{file.name}</Text>
                    <Text className="text-xs" style={{ color: '#9F9FA0' }}>{label}</Text>
                </View>
            </View>
        </TouchableOpacity>
    );
}