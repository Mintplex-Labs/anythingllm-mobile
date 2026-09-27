import DeviceInfo from "react-native-device-info";
import { useEffect, useState } from "react";
import { Linking, Text, TouchableOpacity, View } from "react-native";
import { WarningCircle } from "phosphor-react-native";
import semver from "semver";
import AwaitableAlert from "@/components/AwaitableAlert";
import { PATHS } from "@/utils/paths";
import { useTranslation } from "react-i18next";

export default function ApkVersion() {
    const { t } = useTranslation();
    const deviceVersion = DeviceInfo.getVersion();
    const [isOnLatestVersion, setIsOnLatestVersion] = useState<boolean>(true);
    const [remoteVersion, setRemoteVersion] = useState<string>(deviceVersion);

    useEffect(() => {
        const fetchRemoteVersion = async () => {
            try {
                // returns something like: 1.0.2
                await fetch(PATHS.remote_version_url, {
                    method: 'GET',
                    headers: { 'Content-Type': 'text/plain' },
                }).then(res => {
                    if (!res.ok) throw new Error('Failed to fetch remote version');
                    return res.text();
                }).then(text => {
                    const remoteVersion = sanitizeVersion(text);
                    if (!semver.valid(remoteVersion)) throw new Error('Invalid remote version');
                    if (semver.lt(deviceVersion, remoteVersion)) {
                        setIsOnLatestVersion(false);
                        setRemoteVersion(remoteVersion);
                    } else {
                        setIsOnLatestVersion(true);
                        setRemoteVersion(deviceVersion);
                    }
                });
            } catch (error) {
                console.error('fetchRemoteVersion:', error);
            }
        };
        fetchRemoteVersion();
    }, []);

    return (
        <View className="flex flex-row items-end justify-between">
            <Text style={{ color: '#9F9FA0' }} className="text-sm uppercase">
                {t('settings.version.about')}
            </Text>
            {isOnLatestVersion ? (
                <Text style={{ color: '#888' }} className="text-sm">
                    v{deviceVersion}
                </Text>
            ) : (
                <TouchableOpacity
                    className="flex flex-row items-center gap-1" onPress={async () => {
                        await AwaitableAlert(
                            t('settings.version.update_available_title'),
                            t('settings.version.update_available_message', { version: remoteVersion }),
                            { text: t('settings.version.go_to_app_store'), onPress: () => { Linking.openURL(PATHS.google_play_store) } },
                            { text: t('common.cancel'), onPress: () => { }, style: 'cancel' },
                        )
                    }}>
                    <WarningCircle size={14} color="#ffba00" weight="bold" />
                    <Text style={{ color: '#ffba00' }} className="text-sm">
                        v{deviceVersion}
                    </Text>
                </TouchableOpacity>
            )}
        </View >
    );
}

function sanitizeVersion(version: string) {
    try {
        return semver.coerce(version)?.toString() ?? "0.0.0";
    } catch (e) {
        return "0.0.0";
    }
}