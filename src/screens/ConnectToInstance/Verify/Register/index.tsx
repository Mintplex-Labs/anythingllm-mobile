import { useEffect, useState, useMemo } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import AnythingLLMExternal from "@/utils/AnythingLLMExternal";
import uiStore from "@/store/UIStore";
import { PATHS } from "@/utils/paths";
import { useNavigation } from "@react-navigation/native";
import { IStatus } from "..";

interface RegisterProps {
    connectionUrl: string;
    updateStatus: (status: IStatus) => void;
}

export default function Register({ connectionUrl, updateStatus }: RegisterProps) {
    const navigation = useNavigation();
    const [deviceToken, setDeviceToken] = useState<string | null>(null);
    const [state, setState] = useState<'waiting_for_registration' | 'awaiting_approval'>('waiting_for_registration');

    // Memoize the AnythingLLMExternal instance to prevent recreation on every render
    const anythingLLMExternal = useMemo(() => new AnythingLLMExternal(connectionUrl), [connectionUrl]);

    useEffect(() => {
        async function registerWithInstance() {
            try {
                const newDeviceToken = await anythingLLMExternal.registerDevice();
                if (newDeviceToken) {
                    await uiStore.setToStorage('anythingllm_external_connection', { token: newDeviceToken, connectionUrl });
                    setDeviceToken(newDeviceToken);
                    setState('awaiting_approval');
                } else throw new Error('Failed to register device');
            } catch (error) {
                console.error('Registration error:', error);
                updateStatus({
                    status: 'error',
                    message: 'Failed to register device. Please try again.',
                });
            }
        }
        registerWithInstance();
    }, [anythingLLMExternal, updateStatus]);

    useEffect(() => {
        if (state === 'awaiting_approval' && deviceToken) {
            async function checkApproval() {
                let attempts = 0;
                let isApproved = false;
                while (attempts <= 10) {
                    console.log('Checking approval', deviceToken, `${attempts}/10`);
                    isApproved = await anythingLLMExternal.tokenIsApproved(deviceToken as string);
                    if (isApproved) {
                        updateStatus({
                            status: 'import',
                            message: 'Collecting instance data...',
                        });
                        break;
                    }
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    attempts++;
                }

                // Broke out of loop due to max attempts without approval
                if (!isApproved) {
                    updateStatus({
                        status: 'error',
                        message: 'Failed to register or approve device. Please try again.',
                    });
                } else {
                    navigation.reset({
                        index: 0,
                        // @ts-ignore
                        routes: [{ name: PATHS.connect_to_instance, params: { page: 'import', params: { connectionUrl, deviceToken } } }],
                    });
                }
            }
            checkApproval();
        }
    }, [state, deviceToken, anythingLLMExternal, updateStatus]);

    if (state === 'waiting_for_registration') {
        return (
            <View className="flex flex-col items-center justify-center gap-4">
                <ActivityIndicator size="large" color="#FFF" />
                <Text style={{ textAlign: 'center' }} className="text-white text-lg">Registering your device...</Text>
                <Text style={{ textAlign: 'center' }} className="text-white text-sm">This may take a few seconds...</Text>
            </View>
        );
    }

    if (state === 'awaiting_approval') {
        return (
            <View className="flex flex-col items-center justify-center gap-4">
                <ActivityIndicator size="large" color="#FFF" />
                <Text style={{ textAlign: 'center' }} className="text-white text-lg">Awaiting approval...</Text>
                <Text style={{ textAlign: 'center' }} className="text-white text-sm">Please approve the device in the AnythingLLM application...</Text>
            </View>
        );
    }

    return null;
}