import { Text, TouchableOpacity, View } from "react-native";
import SafeView from "@/components/SafeView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "phosphor-react-native";
import useHighjackBackButtonPress from "@/hooks/useHighjackBackButtonPress";
import { useState } from "react";
import { useNavigation } from "@react-navigation/native";
import { PATHS } from "@/utils/paths";
import Register from "./Register";

interface VerifyViewProps {
    params: { connectionUrl: string, registrationToken: string };
}

type IVerifyStatus = 'register' | 'import' | 'error';
export type IStatus = {
    status: IVerifyStatus;
    message: string;
}

export function VerifyView({ params }: VerifyViewProps) {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation();
    const connectionUrl = params?.connectionUrl ?? null;
    const registrationToken = params?.registrationToken ?? null;
    const [status, setStatus] = useState<IStatus>({
        status: 'register',
        message: 'Registering your device...',
    });
    const goBack = () => {
        navigation.reset({
            index: 0,
            // @ts-ignore
            routes: [{ name: PATHS.connect_to_instance, params: { page: 'start' } }],
        });
        return true;
    }
    useHighjackBackButtonPress(goBack);

    return (
        <SafeView
            scrollable={false}
            safeAreaClassNames="pt-[21px]"
            containerClassNames="flex-1 flex flex-col"
            safeAreaStyle={{ backgroundColor: '#1B1B1E' }}
        >
            {/* Header */}
            <View style={{ paddingHorizontal: 30, paddingTop: insets.top, paddingBottom: 76 }} className="w-full flex flex-row items-center justify-center relative">
                <TouchableOpacity onPress={goBack} className="absolute top-8 left-0 flex flex-row items-center gap-2">
                    <ArrowLeft size={24} color="#FFF" weight="bold" />
                </TouchableOpacity>
                <Text style={{ maxWidth: '80%' }} numberOfLines={1} ellipsizeMode="middle" className="text-white text-lg font-medium">Verify Connection</Text>
            </View>

            <View style={{ gap: 33 }} className="w-full flex flex-col items-center justify-center">
                {status.status === 'register' && <Register connectionUrl={connectionUrl} registrationToken={registrationToken} updateStatus={setStatus} />}
                {status.status === 'error' && (
                    <View className="flex flex-col items-center justify-center gap-4">
                        <Text style={{ textAlign: 'center' }} className="text-red-500 text-lg">Error</Text>
                        <Text style={{ textAlign: 'center' }} className="text-white text-sm">{status.message}</Text>
                        <TouchableOpacity onPress={goBack} className="bg-white rounded-full px-4 py-2">
                            <Text className="text-black text-sm">Go Back</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </SafeView >
    );
}