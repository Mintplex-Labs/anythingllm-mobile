import { useEffect, useState, useMemo } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import AnythingLLMExternal from "@/utils/AnythingLLMExternal";
import uiStore from "@/store/UIStore";
import { PATHS } from "@/utils/paths";
import { useNavigation } from "@react-navigation/native";
import { IStatus } from "..";
import { IExternalConnection } from "../..";
import Telemetry from "@/utils/Telemetry";
import { useTranslation } from "react-i18next";

interface RegisterProps {
    connectionUrl: string; // eg: http://192.168.1.100:3000/api/mobile
    registrationToken: string; // eg: 1234567890 - temporary registration token from AnythingLLM instance
    updateStatus: (status: IStatus) => void;
}

export default function Register({ connectionUrl, registrationToken, updateStatus }: RegisterProps) {
    const { t } = useTranslation();
    const navigation = useNavigation();
    const [deviceToken, setDeviceToken] = useState<string | null>(null);
    const [state, setState] = useState<'waiting_for_registration' | 'awaiting_approval'>('waiting_for_registration');

    // Memoize the AnythingLLMExternal instance to prevent recreation on every render
    // Pass through the registration token to the AnythingLLMExternal instance so we can call registerDevice()
    const anythingLLMExternal = useMemo(() => new AnythingLLMExternal(connectionUrl, '', registrationToken), [connectionUrl, registrationToken]);

    useEffect(() => {
        async function registerWithInstance() {
            try {
                const registration = await anythingLLMExternal.registerDevice();
                await uiStore.setToStorage('current_anythingllm_external_connection', { token: registration.token, connectionUrl, platform: registration.platform });

                // Add to anythingllm_external_connections for future use
                const connections = await uiStore.getFromStorage('anythingllm_external_connections', []) as IExternalConnection[];
                connections.push({ token: registration.token, connectionUrl, platform: registration.platform });
                await uiStore.setToStorage('anythingllm_external_connections', connections);
                Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.EXTERNAL_CONNECTION_ESTABLISHED);

                setDeviceToken(registration.token);
                setState('awaiting_approval');
            } catch (error) {
                console.error('Registration error:', error);
                updateStatus({
                    status: 'error',
                    message: error ? (error as Error)?.message : t('connect.verify.register_failed'),
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
                            message: t('connect.verify.collecting_data'),
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
                        message: t('connect.verify.approval_failed'),
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
                <Text style={{ textAlign: 'center' }} className="text-white text-lg">{t('connect.verify.registering')}</Text>
                <Text style={{ textAlign: 'center' }} className="text-white text-sm">{t('connect.verify.few_seconds')}</Text>
            </View>
        );
    }

    if (state === 'awaiting_approval') {
        return (
            <View className="flex flex-col items-center justify-center gap-4">
                <ActivityIndicator size="large" color="#FFF" />
                <Text style={{ textAlign: 'center' }} className="text-white text-lg">{t('connect.verify.awaiting_approval')}</Text>
                <Text style={{ textAlign: 'center' }} className="text-white text-sm">{t('connect.verify.approve_in_app')}</Text>
            </View>
        );
    }

    return null;
}