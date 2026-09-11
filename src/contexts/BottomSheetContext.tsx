import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import uiStore from '@/store/UIStore';

export const BOTTOM_SHEET_NAMES = {
    PRIMARY_PROMPT_INPUT: 'primary-prompt-input',
    MODEL_CHIP_SELECTION: 'model-chip-selection',
    SETTINGS: 'settings',
    ATTACHMENTS: 'attachments',
    TOOLS: 'tools',
    WORKSPACE_FILES: 'workspace-files',
    CITATIONS: 'citations',
    THREAD_MENU: 'thread-menu',
    MESSAGE_ACTIONS: 'message-actions',
} as const;
export type BottomSheetType = (typeof BOTTOM_SHEET_NAMES)[keyof typeof BOTTOM_SHEET_NAMES] | null;

export const BOTTOM_SHEET_EVENTS = {
    DISMISS_ALL_SHEETS: 'dismissAllSheets',
} as const;
export type BottomSheetEvent = (typeof BOTTOM_SHEET_EVENTS)[keyof typeof BOTTOM_SHEET_EVENTS];

interface BottomSheetContextType {
    activeSheet: BottomSheetType;
    /** Ref-backed check that is correct even inside callbacks the sheet library fires synchronously. */
    isSheetActive: (type: BottomSheetType) => boolean;
    registerSheet: (type: BottomSheetType, ref: React.RefObject<BottomSheetModal>) => void;
    unregisterSheet: (type: BottomSheetType) => void;
    presentSheet: (type: BottomSheetType, force?: boolean) => void;
    dismissSheet: (type: BottomSheetType) => void;
    dismissAllSheets: () => void;
}

const BottomSheetContext = createContext<BottomSheetContextType | null>(null);

const DEBUG = false;
function debug(text: string, ...args: any[]) {
    if (DEBUG) console.log(`[BottomSheetContext] ${text}`, ...args);
}

export function BottomSheetProvider({ children }: { children: React.ReactNode }) {
    const [activeSheet, setActiveSheet] = useState<BottomSheetType>(null);
    // Mirror of activeSheet that is safe to read inside callbacks fired synchronously by the
    // bottom-sheet library (onDismiss can run before React commits the state update).
    const activeSheetRef = useRef<BottomSheetType>(null);
    const setActive = useCallback((type: BottomSheetType) => {
        activeSheetRef.current = type;
        setActiveSheet(type);
    }, []);
    const sheetRefs = useRef<Map<BottomSheetType, React.RefObject<BottomSheetModal>>>(new Map());

    const registerSheet = useCallback((type: BottomSheetType, ref: React.RefObject<BottomSheetModal>) => {
        debug('registerSheet', { type });
        sheetRefs.current.set(type, ref);
    }, []);

    const unregisterSheet = useCallback((type: BottomSheetType) => {
        debug('unregisterSheet', { type });
        sheetRefs.current.delete(type);
    }, []);

    const presentSheet = useCallback((type: BottomSheetType, force: boolean = false) => {
        const previous = activeSheetRef.current;
        debug('presentSheet', { type, force, activeSheet: previous });
        if (previous === type && !force) return;

        // Only dismiss the sheet that is actually open. Since @gorhom/bottom-sheet 5.2, dismiss() on a
        // sheet that is not presented still fires its onDismiss synchronously; several onDismiss handlers
        // re-present the prompt input, so dismissing every registered sheet recursed until the stack blew.
        const next = sheetRefs.current.get(type)?.current;
        setActive(next ? type : null);
        if (previous && previous !== type) sheetRefs.current.get(previous)?.current?.dismiss();
        next?.present();
    }, [setActive]);

    const isSheetActive = useCallback((type: BottomSheetType) => activeSheetRef.current === type, []);

    const dismissSheet = useCallback((type: BottomSheetType) => {
        debug('dismissSheet', { type });
        // onDismiss -> dismissSheet -> dismiss() -> onDismiss would loop; only act on the active sheet.
        if (activeSheetRef.current !== type) return;
        setActive(null);
        sheetRefs.current.get(type)?.current?.dismiss();
    }, [setActive]);

    const dismissAllSheets = useCallback(() => {
        debug('dismissAllSheets');
        const previous = activeSheetRef.current;
        setActive(null);
        if (previous) sheetRefs.current.get(previous)?.current?.dismiss();
    }, [setActive]);

    useEffect(() => {
        uiStore.emitter.addListener(BOTTOM_SHEET_EVENTS.DISMISS_ALL_SHEETS, dismissAllSheets);
        return () => {
            uiStore.emitter.removeAllListeners(BOTTOM_SHEET_EVENTS.DISMISS_ALL_SHEETS);
        };
    }, [dismissAllSheets]);

    return (
        <BottomSheetContext.Provider
            value={{
                activeSheet,
                isSheetActive,
                registerSheet,
                unregisterSheet,
                presentSheet,
                dismissSheet,
                dismissAllSheets,
            }}
        >
            {children}
        </BottomSheetContext.Provider>
    );
}

export function useBottomSheet() {
    const context = useContext(BottomSheetContext);
    if (!context) throw new Error('useBottomSheet must be used within a BottomSheetProvider');
    return context;
} 