import { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity } from "react-native";
import { DocumentType } from "@/database/models/Document";
import Loading from "./loading";
import Error from "./error";
import Empty from "./empty";
import { Circle, File } from "phosphor-react-native";

interface FilesListContainerProps {
    selectedFileUuids: string[];
    setSelectedFileUuids: React.Dispatch<React.SetStateAction<string[]>>;
    files: DocumentType[];
    error: Error | null;
    isLoading: boolean;
    optionsActive: boolean;
    disabled: boolean;
}

export default function FilesListContainer({ selectedFileUuids, setSelectedFileUuids, files, error, isLoading, optionsActive, disabled }: FilesListContainerProps) {
    if (isLoading) return <Loading />;
    if (error) return <Error error={error} />;
    if (files.length === 0) return <Empty />;

    return (
        <FlatList
            data={files}
            renderItem={({ item }) => {
                const isSelected = selectedFileUuids.includes(item.uuid);
                return (
                    <FileItem
                        file={item}
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
    selected: boolean;
    onSelect: () => void;
    disabled: boolean;
}

function FileItem({ file, selected, onSelect, disabled }: FileItemProps) {
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
                <File size={20} color='#FFF' />
                <Text className="text-lg text-[--primary-text]">{file.name}</Text>
            </View>
        </TouchableOpacity>
    );
}