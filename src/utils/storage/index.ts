import { NativeModules } from 'react-native';
const { StorageModule } = NativeModules;

export default class Storage {
    static requireSearch = [
        "com.android.externalstorage.documents",
        "com.android.providers.downloads.documents",
        "com.android.providers.media.documents",
        "com.google.android.apps.photos.content"
    ]

    public static log(message: string) {
        console.log(`\x1b[33m[StorageNativeModule]\x1b[0m ${message}`);
    }

    public static needsStorageSearch(uri: string) {
        if (uri.startsWith('file://')) return false;
        Storage.log(`URI ${uri} requires storage search`);
        return Storage.requireSearch.some(authority => uri.includes(authority));
    }

    static async getRealPathFromUri(uri: string) {
        if (!Storage.needsStorageSearch(uri)) return uri;
        if (uri.includes("%3A")) {
            const docId = uri.split("%3A")[1];
            return `content://media/external/file/${docId}`;
        }
        return await StorageModule.getRealPathFromUri(uri);
    }
}