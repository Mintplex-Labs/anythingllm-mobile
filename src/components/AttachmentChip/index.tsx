import React from 'react';
import { ActivityIndicator, Image, Text, TouchableOpacity, View } from 'react-native';
import {
    File, FileCode, FileCsv, FileDoc, FileHtml, FileMd, FilePdf, FilePpt, FileText, FileTxt, FileXls, X,
    type IconProps,
} from 'phosphor-react-native';
import { getExtension } from '@/utils/DocumentParser/registry';
import { formatBytes } from '@/utils/formatters';

export const ATTACHMENT_CHIP_HEIGHT = 48;
const BADGE_SIZE = 32;
const BADGE_RADIUS = 8;

type FileVisual = { Icon: React.ComponentType<IconProps>; tint: string; label: string };

/**
 * Icon, accent colour and short label per file type. Colours follow the conventions people already
 * associate with each format (Acrobat red, Word blue, Excel green, PowerPoint orange).
 */
const FILE_VISUALS: Record<string, FileVisual> = {
    pdf: { Icon: FilePdf, tint: '#F04438', label: 'PDF' },
    docx: { Icon: FileDoc, tint: '#2B7CD3', label: 'DOCX' },
    doc: { Icon: FileDoc, tint: '#2B7CD3', label: 'DOC' },
    xlsx: { Icon: FileXls, tint: '#21A366', label: 'XLSX' },
    xlsm: { Icon: FileXls, tint: '#21A366', label: 'XLSM' },
    xls: { Icon: FileXls, tint: '#21A366', label: 'XLS' },
    ods: { Icon: FileXls, tint: '#21A366', label: 'ODS' },
    pptx: { Icon: FilePpt, tint: '#D35230', label: 'PPTX' },
    ppt: { Icon: FilePpt, tint: '#D35230', label: 'PPT' },
    csv: { Icon: FileCsv, tint: '#0E9F8A', label: 'CSV' },
    tsv: { Icon: FileCsv, tint: '#0E9F8A', label: 'TSV' },
    md: { Icon: FileMd, tint: '#7880FF', label: 'MD' },
    markdown: { Icon: FileMd, tint: '#7880FF', label: 'MD' },
    html: { Icon: FileHtml, tint: '#E9701D', label: 'HTML' },
    htm: { Icon: FileHtml, tint: '#E9701D', label: 'HTML' },
    json: { Icon: FileCode, tint: '#C9A227', label: 'JSON' },
    xml: { Icon: FileCode, tint: '#C9A227', label: 'XML' },
    yaml: { Icon: FileCode, tint: '#C9A227', label: 'YAML' },
    yml: { Icon: FileCode, tint: '#C9A227', label: 'YAML' },
    txt: { Icon: FileTxt, tint: '#9AA0A6', label: 'TXT' },
    log: { Icon: FileText, tint: '#9AA0A6', label: 'LOG' },
    rtf: { Icon: FileText, tint: '#9AA0A6', label: 'RTF' },
};
const DEFAULT_VISUAL: FileVisual = { Icon: File, tint: '#9AA0A6', label: 'FILE' };

export function getFileVisual(fileName: string): FileVisual {
    const ext = getExtension(fileName);
    if (FILE_VISUALS[ext]) return FILE_VISUALS[ext];
    return ext ? { ...DEFAULT_VISUAL, label: ext.toUpperCase().slice(0, 5) } : DEFAULT_VISUAL;
}

/** 20% alpha of a hex colour for the badge background. */
function tintBackground(hex: string) {
    return `${hex}33`;
}

export interface AttachmentChipProps {
    name: string;
    size?: number;
    processing?: boolean;
    /** Base64 data URL; when present the chip shows a thumbnail instead of a file badge. */
    imageUri?: string;
    onPress?: () => void;
    onRemove?: () => void;
}

/**
 * Compact card for a single attachment above the prompt input: a colour-coded file badge (or image
 * thumbnail), the file name truncated in the middle so the extension survives, a caption with type
 * and size, and a remove button. While processing, the badge becomes a spinner and the card dims.
 */
export default function AttachmentChip({ name, size = 0, processing = false, imageUri, onPress, onRemove }: AttachmentChipProps) {
    const isImage = !!imageUri;
    const visual = getFileVisual(name);
    const caption = processing
        ? 'Processing…'
        : [isImage ? 'Image' : visual.label, size > 0 ? formatBytes(size, 1) : null].filter(Boolean).join(' · ');

    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={processing || !onPress}
            activeOpacity={0.75}
            accessibilityLabel={`${name}${processing ? ', processing' : ''}`}
            className="flex flex-row items-center"
            style={{
                height: ATTACHMENT_CHIP_HEIGHT,
                maxWidth: 240,
                paddingLeft: 8,
                paddingRight: onRemove ? 4 : 12,
                borderRadius: 14,
                backgroundColor: '#26262A',
                borderWidth: 1,
                borderColor: '#38383D',
                opacity: processing ? 0.7 : 1,
                columnGap: 10,
            }}
        >
            {processing ? (
                <View style={{ width: BADGE_SIZE, height: BADGE_SIZE, borderRadius: BADGE_RADIUS, backgroundColor: '#38383D' }} className="items-center justify-center">
                    <ActivityIndicator size="small" color="#FFFFFF" />
                </View>
            ) : isImage ? (
                <Image
                    source={{ uri: imageUri }}
                    style={{ width: BADGE_SIZE, height: BADGE_SIZE, borderRadius: BADGE_RADIUS, backgroundColor: '#38383D' }}
                    resizeMode="cover"
                />
            ) : (
                <View
                    style={{ width: BADGE_SIZE, height: BADGE_SIZE, borderRadius: BADGE_RADIUS, backgroundColor: tintBackground(visual.tint) }}
                    className="items-center justify-center"
                >
                    <visual.Icon size={20} color={visual.tint} weight="fill" />
                </View>
            )}

            <View className="flex-shrink" style={{ minWidth: 0 }}>
                <Text numberOfLines={1} ellipsizeMode="middle" className="text-white text-[13px] font-medium" style={{ lineHeight: 17 }}>
                    {name}
                </Text>
                <Text numberOfLines={1} className="text-[11px]" style={{ color: '#9AA0A6', lineHeight: 14 }}>
                    {caption}
                </Text>
            </View>

            {onRemove && (
                <TouchableOpacity
                    onPress={onRemove}
                    disabled={processing}
                    hitSlop={8}
                    accessibilityLabel={`Remove ${name}`}
                    className="items-center justify-center"
                    style={{ width: 28, height: 28, borderRadius: 14 }}
                >
                    <X size={14} color="#C7C9CC" weight="bold" />
                </TouchableOpacity>
            )}
        </TouchableOpacity>
    );
}
