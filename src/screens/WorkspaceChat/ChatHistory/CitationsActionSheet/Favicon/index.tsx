import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { Globe } from "phosphor-react-native";

/**
 * Builds a favicon URL for a given page URL using Google's favicon service.
 * Returns null if the URL cannot be parsed.
 */
export function getFaviconUrl(url?: string | null): string | null {
    if (!url) return null;
    try {
        const hostname = new URL(url).hostname;
        if (!hostname) return null;
        return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
    } catch {
        return null;
    }
}

/**
 * Renders the favicon for a URL, falling back to a generic globe icon
 * when the URL is invalid or the favicon fails to load.
 */
export default function Favicon({
    url,
    size = 18,
    fallbackColor = "#7cd4fd",
}: {
    url?: string | null;
    size?: number;
    fallbackColor?: string;
}) {
    const faviconUrl = getFaviconUrl(url);
    const [imgError, setImgError] = useState(false);

    useEffect(() => {
        setImgError(false);
    }, [url]);

    if (!faviconUrl || imgError) return <Globe size={size} color={fallbackColor} />;

    return (
        <View
            style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", backgroundColor: "#FFF" }}
            className="flex items-center justify-center"
        >
            <Image
                source={{ uri: faviconUrl }}
                style={{ width: size, height: size }}
                resizeMode="cover"
                onError={() => setImgError(true)}
            />
        </View>
    );
}
