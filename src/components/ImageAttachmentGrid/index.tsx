import React, { useMemo, useState } from 'react';
import { Image, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import ImageView from 'react-native-image-viewing';
import { X } from 'phosphor-react-native';
import { type IAttachment } from '@/utils/AiProviders/baseOpenAILikeProvider';

/** Edge of the square container every layout fills - the same footprint whether 1 or 4+ images. */
export const IMAGE_GRID_SIZE = 220;
const GAP = 4;
const RADIUS = 10;
const MAX_VISIBLE = 4;

export function isImageAttachment(attachment: any): attachment is IAttachment {
    return typeof attachment?.contentString === 'string' && attachment.contentString.startsWith('data:image/');
}

/**
 * Fixed-size collage of the images attached to a prompt. Layout follows the count:
 *  1 - one full tile, 2 - side by side, 3 - one tall tile + two stacked, 4 - a 2x2 grid.
 * Beyond four the last tile is dimmed and labelled "+N". Tapping any tile opens the lightbox on it.
 */
export default function ImageAttachmentGrid({ images, size = IMAGE_GRID_SIZE, align = 'flex-end', style, onRemove }: {
    images: IAttachment[];
    size?: number;
    align?: 'flex-start' | 'flex-end';
    style?: StyleProp<ViewStyle>;
    /** When provided the lightbox shows a remove button for the open image */
    onRemove?: (image: IAttachment, index: number) => void;
}) {
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    if (!images.length) return null;

    const half = (size - GAP) / 2;
    const visible = images.slice(0, MAX_VISIBLE);
    const overflow = images.length - MAX_VISIBLE;

    const tile = (index: number, width: number, height: number) => {
        const image = visible[index];
        const isOverflowTile = overflow > 0 && index === MAX_VISIBLE - 1;
        return (
            <TouchableOpacity
                key={`${index}-${image.name}`}
                onPress={() => setLightboxIndex(index)}
                activeOpacity={0.8}
                accessibilityLabel={isOverflowTile ? `${overflow} more images` : (image.name || 'Attached image')}
                style={{ width, height, borderRadius: RADIUS, overflow: 'hidden', backgroundColor: '#2a2a2d' }}
            >
                <Image source={{ uri: image.contentString }} style={{ width, height }} resizeMode="cover" />
                {isOverflowTile && (
                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' }} className="flex items-center justify-center">
                        <Text className="text-white text-xl font-semibold">+{overflow}</Text>
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    let layout: React.ReactNode;
    switch (visible.length) {
        case 1:
            layout = tile(0, size, size);
            break;
        case 2:
            layout = (
                <View className="flex flex-row" style={{ gap: GAP }}>
                    {tile(0, half, size)}
                    {tile(1, half, size)}
                </View>
            );
            break;
        case 3:
            layout = (
                <View className="flex flex-row" style={{ gap: GAP }}>
                    {tile(0, half, size)}
                    <View className="flex flex-col" style={{ gap: GAP }}>
                        {tile(1, half, half)}
                        {tile(2, half, half)}
                    </View>
                </View>
            );
            break;
        default:
            layout = (
                <View className="flex flex-col" style={{ gap: GAP }}>
                    <View className="flex flex-row" style={{ gap: GAP }}>
                        {tile(0, half, half)}
                        {tile(1, half, half)}
                    </View>
                    <View className="flex flex-row" style={{ gap: GAP }}>
                        {tile(2, half, half)}
                        {tile(3, half, half)}
                    </View>
                </View>
            );
    }

    return (
        <View style={[{ width: size, height: size, alignSelf: align }, style]}>
            {layout}
            <ImageLightbox
                images={images}
                index={lightboxIndex}
                onClose={() => setLightboxIndex(null)}
                onRemove={onRemove}
            />
        </View>
    );
}

/**
 * Full screen, pinch-to-zoom, swipe-to-dismiss viewer over the given images.
 * `index` null keeps it closed.
 */
export function ImageLightbox({ images, index, onClose, onRemove }: {
    images: IAttachment[];
    index: number | null;
    onClose: () => void;
    onRemove?: (image: IAttachment, index: number) => void;
}) {
    const sources = useMemo(() => images.map((image) => ({ uri: image.contentString })), [images]);
    if (index === null || !images.length) return null;

    const Header = ({ imageIndex }: { imageIndex: number }) => (
        <View className="flex flex-row items-center justify-between" style={{ paddingHorizontal: 20, paddingTop: 50 }}>
            <Text className="text-white text-sm" numberOfLines={1} style={{ maxWidth: '70%' }}>
                {images.length > 1 ? `${imageIndex + 1} of ${images.length}` : images[imageIndex]?.name}
            </Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close image preview" style={{ padding: 6 }}>
                <X size={22} color="#FFF" />
            </TouchableOpacity>
        </View>
    );

    const Footer = onRemove
        ? ({ imageIndex }: { imageIndex: number }) => (
            <View className="flex flex-row justify-center" style={{ paddingBottom: 50 }}>
                <TouchableOpacity
                    onPress={() => { onClose(); onRemove(images[imageIndex], imageIndex); }}
                    accessibilityLabel="Remove image"
                    style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)' }}
                >
                    <Text className="text-white font-medium">Remove image</Text>
                </TouchableOpacity>
            </View>
        )
        : undefined;

    return (
        <ImageView
            images={sources}
            imageIndex={Math.min(index, images.length - 1)}
            visible={true}
            onRequestClose={onClose}
            swipeToCloseEnabled={true}
            doubleTapToZoomEnabled={true}
            backgroundColor="rgba(0,0,0,0.95)"
            HeaderComponent={Header}
            FooterComponent={Footer}
        />
    );
}
