import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import SafeView from "@/components/SafeView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "phosphor-react-native";
import { IWorkspacePageKey } from "../index";
import { PATHS } from "@/utils/paths";
import useHighjackBackButtonPress from "@/hooks/useHighjackBackButtonPress";
import { useEffect, useRef, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import { Camera, CameraDevice, useCameraPermission, getCameraDevice, useCodeScanner } from "react-native-vision-camera";
import { showToast } from "@/utils/Notification";

interface MainViewProps {
    goToPage: (page: IWorkspacePageKey) => void;
}

export function MainView({ goToPage }: MainViewProps) {
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const [qrCode, setQRCode] = useState<string | null>(null);
    function goHome() {
        navigation.reset({
            index: 0,
            // @ts-ignore
            routes: [{ name: PATHS.home }],
        });
        return true;
    }

    function onQRCodeScanned(qrCode: any) {
        showToast('QR code found - ' + qrCode, 'short');
        setQRCode(qrCode);
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
                <TouchableOpacity onPress={goHome} className="absolute left-0 flex flex-row items-center gap-2">
                    <ArrowLeft size={24} color="#FFF" weight="bold" />
                </TouchableOpacity>
                <Text style={{ maxWidth: '80%' }} numberOfLines={1} ellipsizeMode="middle" className="text-white text-lg font-medium">Import Workspace</Text>
            </View>

            <View style={{ gap: 33 }} className="w-full flex flex-col items-center justify-center">
                <CameraView onScanReceived={onQRCodeScanned} />
                <Text style={{ textAlign: 'center' }} className="text-white text-lg">
                    Scan the QR code for your AnythingLLM workspace to connect or sync it's data to this mobile device!
                </Text>
            </View>

            {!qrCode && (
                <View className="flex-1 w-full flex flex-col items-center justify-center">
                    <Text className="text-white text-lg opacity-50">Waiting for QR code...</Text>
                </View>
            )}
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