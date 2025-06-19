import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, TouchableOpacity, Text, ActivityIndicator, Alert } from 'react-native';
import { BottomSheetBackdrop, BottomSheetBackdropProps, BottomSheetModal } from '@gorhom/bottom-sheet';
import { FlatList } from 'react-native-gesture-handler';
import useLlmPreference from '@/hooks/useLLMPreference';
import { Circle } from 'phosphor-react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';
import { resolveDestinationPathFromGGUFUrl } from '@/utils/defaultModels';
import uiStore from "@/store/UIStore";
import AwaitableAlert from '@/components/AwaitableAlert';
import { formatBytes } from '@/utils/formatters';
import { useNetInfo } from '@react-native-community/netinfo';
import DownloadProgress from '@/screens/Onboarding/ModelSelection/DownloadProgress';
import { useBottomSheet, BOTTOM_SHEET_NAMES } from '@/contexts/BottomSheetContext';

export default function ModelChip({ modelName }: { modelName?: string }) {
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const { registerSheet, presentSheet, dismissSheet } = useBottomSheet();
    const renderBackdrop = useCallback(
        (props: BottomSheetBackdropProps) => (
            <BottomSheetBackdrop
                {...props}
                disappearsOnIndex={-1}
                appearsOnIndex={0}
                opacity={0.7}
            />
        ),
        []
    );
    const parsedModelName = useMemo(() => {
        if (!modelName) return null;
        return modelName
            .split('/')
            .pop()
            ?.replaceAll(new RegExp('(-?)(gguf|GGUF|Gguf)$', 'g'), '') // Remove -gguf suffix
            ?.replaceAll(new RegExp('-', 'g'), ' ') // Replace - with space
            ?.replace(/^./, (str) => str.toUpperCase()); // Capitalize first letter
    }, [modelName]);

    useEffect(() => {
        registerSheet(BOTTOM_SHEET_NAMES.MODEL_CHIP_SELECTION, bottomSheetRef);
    }, [registerSheet]);

    if (!modelName) return null;
    return (
        <Fragment>
            <TouchableOpacity onPress={() => presentSheet(BOTTOM_SHEET_NAMES.MODEL_CHIP_SELECTION)} style={{ marginTop: -5, maxWidth: 200 }} className='bg-white/10 rounded-full'>
                <Text
                    style={{ fontSize: 14, paddingVertical: 4, paddingHorizontal: 12 }}
                    className='text-white'
                    numberOfLines={1}
                    ellipsizeMode='middle'
                >
                    {parsedModelName || 'Unknown LLM'}
                </Text>
            </TouchableOpacity>
            <BottomSheetModal
                ref={bottomSheetRef}
                index={0}
                snapPoints={['50%', '95%']}
                enableDynamicSizing={false}
                backdropComponent={renderBackdrop}
                backgroundStyle={{ backgroundColor: '#1B1B1E' }}
                handleIndicatorStyle={{ backgroundColor: '#9F9FA0', width: 45, margin: 10 }}
                onDismiss={() => dismissSheet(BOTTOM_SHEET_NAMES.MODEL_CHIP_SELECTION)}
            >
                <AvailableModels closeSheet={() => dismissSheet(BOTTOM_SHEET_NAMES.MODEL_CHIP_SELECTION)} />
            </BottomSheetModal>
        </Fragment>
    );
}

interface AvailableModel {
    id: string;
    name: string;
    size: number;
    modelId: string;
    downloadUrl: string;
    description?: string;
}

function AvailableModels({ closeSheet }: { closeSheet: () => void }) {
    const netInfo = useNetInfo();
    const { llmPreferences, LLMProvider, isLoading, fetchLLMPreference } = useLlmPreference();
    const [selectedModel, setSelectedModel] = useState<string | null>(null);
    const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
    const [modelDownloadUrl, setModelDownloadUrl] = useState<string | null>(null);

    async function completeModelSelection(model: AvailableModel) {
        setSelectedModel(model.modelId);
        await uiStore.setToStorage('llmPreference', { ...llmPreferences, config: { ...llmPreferences.config, model: model.modelId } });
        await fetchLLMPreference();
        setModelDownloadUrl(null);
        closeSheet();
    }

    async function handleModelSelection(model: AvailableModel) {
        if (!!modelDownloadUrl) return;

        const storageLocation = resolveDestinationPathFromGGUFUrl(model.downloadUrl);
        const isDownloaded = await RNFS.exists(storageLocation);
        if (isDownloaded) return completeModelSelection(model);

        const modelSize = typeof model.size === 'number' ? formatBytes(model.size) : model.size;
        if (!netInfo.isConnected) return Alert.alert('No internet connection.', 'You will need to be connected to the internet to download any model.');

        if (netInfo.type !== 'wifi') {
            const ignoreWarning = await AwaitableAlert(
                'Data usage warning',
                `We recommend using a Wi-Fi connection to download the model since it's ${modelSize} in size.`,
                { text: 'Cancel', style: 'cancel' },
                { text: 'Continue Anyway', style: 'default' }
            );
            if (!ignoreWarning) return;
        }

        const shouldDownload = await AwaitableAlert(
            'Downloading model?',
            `This will download the model to your device. It is ${modelSize} in size.`,
            { text: 'Cancel', style: 'cancel' },
            { text: 'Continue with download', style: 'default' }
        );
        if (!shouldDownload) return;
        setModelDownloadUrl(model.downloadUrl);
    }

    useEffect(() => {
        if (LLMProvider) {
            setAvailableModels(LLMProvider.availableModels() as AvailableModel[]);
            setSelectedModel(LLMProvider.model);
        } else setAvailableModels([]);
    }, [LLMProvider]);

    if (isLoading) return <ActivityIndicator size='large' color='white' />;
    return (
        <View className='flex flex-col items-center justify-center gap-y-4 w-full h-full'>
            <Text className='text-white text-lg font-semibold py-4'>Choose your model</Text>
            {!availableModels.length && <Text className='text-white text-sm'>No models available</Text>}
            {availableModels.length && (
                <FlatList
                    data={availableModels}
                    className='w-full'
                    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100, gap: 10 }}
                    showsVerticalScrollIndicator={true}
                    scrollEnabled={true}
                    renderItem={({ item }) => {
                        const isCurrentlySelected = selectedModel === item.modelId;

                        return (
                            <TouchableOpacity
                                key={item.modelId}
                                disabled={!!modelDownloadUrl && modelDownloadUrl !== item.downloadUrl}
                                onPress={() => handleModelSelection(item)}
                                className='flex flex-row items-center justify-between w-full disabled:opacity-50'>
                                <View className='flex flex-col items-start justify-start'>
                                    <View className='flex flex-row items-center justify-center gap-x-2'>
                                        <Text className='text-white font-semibold text-lg'>{item.name}</Text>
                                        {modelDownloadUrl === item.downloadUrl && <DownloadProgress downloadUrl={modelDownloadUrl} onComplete={() => completeModelSelection(item)} />}
                                    </View>
                                    {item.description && <Text className='text-sm text-[--secondary-text] mt-1'>{item.description}</Text>}
                                </View>
                                <View className='flex flex-row items-center justify-center'>
                                    {isCurrentlySelected ? (
                                        <View className='relative'>
                                            <Circle size={24} color='#FFF' />
                                            <Circle size={16} color='#36bffa' weight='fill' style={{ position: 'absolute', top: (24 - 16) / 2, left: (24 - 16) / 2 }} />
                                        </View>
                                    ) : (
                                        <Circle size={24} color='#888' />
                                    )}
                                </View>
                            </TouchableOpacity>
                        )
                    }}
                />
            )}
        </View>
    );
}