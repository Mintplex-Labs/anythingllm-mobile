import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { BottomSheetBackdrop, BottomSheetBackdropProps, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle, DotsThreeVertical, Export, FileCode, FileMd, FilePdf, FileText, FolderOpen, ShareNetwork } from 'phosphor-react-native';
import { MenuRow, SheetHeader, MUTED_TEXT, ROW_ICON_BACKGROUND, SHEET_BACKGROUND, SUCCESS } from '@/components/SheetMenu';
import { useBottomSheet, BOTTOM_SHEET_NAMES } from '@/contexts/BottomSheetContext';
import useLlmPreference from '@/hooks/useLLMPreference';
import { type WorkspaceType } from '@/database/models/Workspace';
import { type WorkspaceThreadType } from '@/database/models/WorkspaceThread';
import { showToast } from '@/utils/Notification';
import Telemetry from '@/utils/Telemetry';
import {
  EXPORT_FORMATS,
  OPEN_LOCATION_LABEL,
  buildThreadExportContext,
  openThreadExportLocation,
  resolveThreadModelName,
  saveThreadExport,
  shareThreadExport,
  type ExportFormat,
  type SavedThreadExport,
} from '@/utils/chat/export';

type MenuPage = 'menu' | 'export' | 'saved';

const EXPORT_ICONS: Record<ExportFormat, React.ReactNode> = {
  txt: <FileText size={22} color="#FFF" />,
  md: <FileMd size={22} color="#FFF" />,
  json: <FileCode size={22} color="#FFF" />,
  pdf: <FilePdf size={22} color="#FFF" />,
};

/** The 3-dot trigger shown to the right of the "new thread" button */
export function ThreadMenuIcon() {
  const { presentSheet } = useBottomSheet();
  return (
    <TouchableOpacity
      onPress={() => presentSheet(BOTTOM_SHEET_NAMES.THREAD_MENU)}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
      accessibilityLabel="Thread options">
      <DotsThreeVertical size={30} color="white" weight="bold" />
    </TouchableOpacity>
  );
}

/**
 * Bottom sheet with per-thread actions. Three "pages" live inside the one sheet:
 * the option list, the export format picker, and a confirmation once the file is
 * saved to the device with an optional share step. The user can go back from the
 * export page or pull the sheet down at any time.
 */
export default function ThreadMenuSheet({ workspace, thread }: { workspace: WorkspaceType; thread: WorkspaceThreadType }) {
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const { registerSheet, dismissSheet, dismissAllSheets } = useBottomSheet();
  const { llmPreferences } = useLlmPreference();
  const [page, setPage] = useState<MenuPage>('menu');
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [saved, setSaved] = useState<SavedThreadExport | null>(null);
  const [sharing, setSharing] = useState(false);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.7} />,
    [],
  );

  useEffect(() => {
    registerSheet(BOTTOM_SHEET_NAMES.THREAD_MENU, sheetRef);
  }, [registerSheet]);

  const handleDismiss = () => {
    setPage('menu');
    setExporting(null);
    setSaved(null);
    setSharing(false);
    dismissSheet(BOTTOM_SHEET_NAMES.THREAD_MENU);
  };

  const handleExport = async (format: ExportFormat) => {
    if (exporting) return;
    setExporting(format);
    try {
      const modelName = await resolveThreadModelName(workspace, llmPreferences);
      const ctx = await buildThreadExportContext({ workspace, thread, modelName });
      const result = await saveThreadExport(format, ctx);
      Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.THREAD_EXPORTED, {
        format,
        isRemote: !!(workspace.isRemote || thread.isRemote),
        messageCount: ctx.chats.length,
      });
      setSaved(result);
      setPage('saved');
    } catch (error: any) {
      console.error('[ThreadMenu] export failed', error);
      showToast(`Could not export thread: ${error?.message ?? 'unknown error'}`, 'long');
    } finally {
      setExporting(null);
    }
  };

  const handleShare = async () => {
    if (!saved || sharing) return;
    setSharing(true);
    try {
      await shareThreadExport(saved);
      dismissAllSheets();
    } catch (error: any) {
      console.error('[ThreadMenu] share failed', error);
      showToast(`Could not open share sheet: ${error?.message ?? 'unknown error'}`, 'long');
    } finally {
      setSharing(false);
    }
  };

  const handleOpenLocation = async () => {
    if (!saved) return;
    try {
      await openThreadExportLocation(saved);
      dismissAllSheets();
    } catch (error: any) {
      console.error('[ThreadMenu] open location failed', error);
      showToast(`Saved to ${saved.locationLabel}, but the folder could not be opened`, 'long');
    }
  };

  return (
    <BottomSheetModal
      ref={sheetRef}
      index={0}
      enableDynamicSizing
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: SHEET_BACKGROUND }}
      handleIndicatorStyle={{ backgroundColor: MUTED_TEXT, width: 45, margin: 10 }}
      onDismiss={handleDismiss}>
      <BottomSheetView style={{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 16) + 8 }}>
        {page === 'menu' && <MenuPageContent onExport={() => setPage('export')} />}
        {page === 'export' && (
          <ExportPageContent exporting={exporting} onBack={() => setPage('menu')} onSelect={handleExport} />
        )}
        {page === 'saved' && saved && (
          <SavedPageContent saved={saved} sharing={sharing} onShare={handleShare} onOpenLocation={handleOpenLocation} onDone={dismissAllSheets} />
        )}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

function MenuPageContent({ onExport }: { onExport: () => void }) {
  return (
    <View style={{ paddingTop: 8 }}>
      <MenuRow icon={<Export size={22} color="#FFF" />} title="Export Chat Thread" onPress={onExport} />
    </View>
  );
}

function ExportPageContent({
  exporting,
  onBack,
  onSelect,
}: {
  exporting: ExportFormat | null;
  onBack: () => void;
  onSelect: (format: ExportFormat) => void;
}) {
  return (
    <View>
      <SheetHeader title="Export Chat Thread" onBack={onBack} />
      {Object.values(EXPORT_FORMATS).map(definition => (
        <MenuRow
          key={definition.format}
          icon={EXPORT_ICONS[definition.format]}
          title={`${definition.label} (.${definition.extension})`}
          description={definition.description}
          disabled={!!exporting && exporting !== definition.format}
          onPress={() => onSelect(definition.format)}
          trailing={exporting === definition.format ? <ActivityIndicator color="#FFF" /> : undefined}
        />
      ))}
    </View>
  );
}

function SavedPageContent({
  saved,
  sharing,
  onShare,
  onOpenLocation,
  onDone,
}: {
  saved: SavedThreadExport;
  sharing: boolean;
  onShare: () => void;
  onOpenLocation: () => void;
  onDone: () => void;
}) {
  return (
    <View>
      <View style={{ gap: 10, marginBottom: 22 }} className="flex flex-col items-center">
        <CheckCircle size={48} color={SUCCESS} weight="fill" />
        <Text className="text-white text-lg font-medium">Saved to your device</Text>
        <Text numberOfLines={1} ellipsizeMode="middle" className="text-white text-base" style={{ maxWidth: '90%' }}>
          {saved.filename}
        </Text>
        <Text style={{ color: MUTED_TEXT, textAlign: 'center' }} className="text-sm">
          {saved.locationLabel}
        </Text>
      </View>

      <View style={{ gap: 10 }} className="flex flex-col">
        <TouchableOpacity
          onPress={onShare}
          disabled={sharing}
          style={{ gap: 8, paddingVertical: 14, backgroundColor: '#FFF', opacity: sharing ? 0.6 : 1 }}
          className="flex flex-row items-center justify-center rounded-xl">
          {sharing ? <ActivityIndicator color="#000" /> : <ShareNetwork size={20} color="#000" />}
          <Text className="text-black text-base font-semibold">Share</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onOpenLocation}
          style={{ gap: 8, paddingVertical: 14, backgroundColor: ROW_ICON_BACKGROUND }}
          className="flex flex-row items-center justify-center rounded-xl">
          <FolderOpen size={20} color="#FFF" />
          <Text className="text-white text-base font-semibold">{OPEN_LOCATION_LABEL}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onDone} style={{ paddingVertical: 8 }} className="flex flex-row items-center justify-center">
          <Text style={{ color: MUTED_TEXT }} className="text-base">Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
