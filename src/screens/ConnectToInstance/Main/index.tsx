import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import SafeView from "@/components/SafeView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "phosphor-react-native";
import { PATHS } from "@/utils/paths";
import useHighjackBackButtonPress from "@/hooks/useHighjackBackButtonPress";
import { useEffect, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import { Camera, CameraDevice, useCameraPermission, getCameraDevice, useCodeScanner } from "react-native-vision-camera";

export function MainView() {
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    function goHome() {
        navigation.reset({
            index: 0,
            // @ts-ignore
            routes: [{ name: PATHS.home }],
        });
        return true;
    }

    function onQRCodeScanned(connectionUrlFromQRCode: string) {
        try {
            if (!connectionUrlFromQRCode) throw new Error('Invalid connection URL');
            const connectionUrl = new URL(connectionUrlFromQRCode);
            if (connectionUrl.protocol !== 'http:' && connectionUrl.protocol !== 'https:') throw new Error('Invalid connection URL');
            if (connectionUrl.pathname !== '/api/mobile') throw new Error('Invalid connection URL');
            navigation.reset({
                index: 0,
                // @ts-ignore
                routes: [{ name: PATHS.connect_to_instance, params: { page: 'verify', connectionUrl: connectionUrlFromQRCode } }],
            });
            return true
        } catch (error) {
            console.error(error);
            return false;
        }
    }
    useHighjackBackButtonPress(goHome);

    return (
        <SafeView
            scrollable={false}
            safeAreaClassNames="pt-[21px]"
            containerClassNames="flex-1 flex flex-col"
            safeAreaStyle={{ backgroundColor: '#1B1B1E' }}
        >
            {/* Header */}
            <View style={{ paddingHorizontal: 30, paddingTop: insets.top, paddingBottom: 76 }} className="w-full flex flex-row items-center justify-center relative">
                <TouchableOpacity onPress={goHome} className="absolute top-8 left-0 flex flex-row items-center gap-2">
                    <ArrowLeft size={24} color="#FFF" weight="bold" />
                </TouchableOpacity>
                <Text style={{ maxWidth: '80%' }} numberOfLines={1} ellipsizeMode="middle" className="text-white text-lg font-medium">Connect to AnythingLLM</Text>
            </View>

            <View style={{ gap: 33 }} className="w-full flex flex-col items-center justify-center">
                <CameraView onScanReceived={onQRCodeScanned} />
                <Text style={{ textAlign: 'center' }} className="text-white text-lg">
                    Scan the QR code for your AnythingLLM desktop app to sync it's data to this mobile device for AI on the go!
                </Text>
            </View>
        </SafeView >
    );
}

interface CameraViewProps {
    onScanReceived: (qrCode: any) => void;
}

function CameraView({ onScanReceived }: CameraViewProps) {
    const [loading, setLoading] = useState(true);
    const [device, setDevice] = useState<CameraDevice | null>(null);
    const { hasPermission, requestPermission } = useCameraPermission();
    const codeScanner = useCodeScanner({
        codeTypes: ['qr'],
        onCodeScanned: (codes) => {
            onScanReceived(codes[0].value);
        }
    })

    useEffect(() => {
        if (hasPermission) {
            const device = getCameraDevice(Camera.getAvailableCameraDevices(), 'back');
            if (device) setDevice(device);
            setLoading(false);
            return;
        }
        requestPermission().then((granted) => {
            if (granted) {
                const device = getCameraDevice(Camera.getAvailableCameraDevices(), 'back');
                if (device) setDevice(device);
                setLoading(false);
            }
        });
    }, []);

    if (loading || !device) return <ActivityIndicator size="large" color="#fff" />;
    return (
        <View style={{ height: 320, width: 320, borderWidth: 1, overflow: 'hidden' }} className="w-full flex flex-col items-center justify-center mx-auto border-white/40 rounded-lg">
            <Camera
                style={{ flex: 1, width: '100%', height: '100%' }}
                device={device}
                isActive={true}
                codeScanner={codeScanner}
            />
        </View>
    );
}