import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import uiStore from '@/store/UIStore';

export const BOTTOM_SHEET_NAMES = {
    PRIMARY_PROMPT_INPUT: 'primary-prompt-input',
    MODEL_CHIP_SELECTION: 'model-chip-selection',
    SETTINGS: 'settings',
    TOOLS: 'tools',
    WORKSPACE_FILES: 'workspace-files',
    CITATIONS: 'citations',
} as const;
export type BottomSheetType = (typeof BOTTOM_SHEET_NAMES)[keyof typeof BOTTOM_SHEET_NAMES] | null;

export const BOTTOM_SHEET_EVENTS = {
    DISMISS_ALL_SHEETS: 'dismissAllSheets',
} as const;
export type BottomSheetEvent = (typeof BOTTOM_SHEET_EVENTS)[keyof typeof BOTTOM_SHEET_EVENTS];

interface BottomSheetContextType {
    activeSheet: BottomSheetType;
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
        debug('presentSheet', { type, force, activeSheet });
        if (activeSheet === type && !force) return;

        // Dismiss all sheets except the one we are presenting
        sheetRefs.current.forEach((ref, sheetType) => sheetType !== type && ref.current?.dismiss());
        const newRef = sheetRefs.current.get(type);
        if (newRef?.current) {
            newRef.current.present();
            setActiveSheet(type);
        }
    }, [activeSheet]);

    const dismissSheet = useCallback((type: BottomSheetType) => {
        debug('dismissSheet', { type });
        const ref = sheetRefs.current.get(type);
        if (ref?.current) {
            ref.current.dismiss();
            setActiveSheet(null);
        }
    }, []);

    const dismissAllSheets = useCallback(() => {
        debug('dismissAllSheets');
        sheetRefs.current.forEach((ref) => ref.current?.dismiss());
        setActiveSheet(null);
    }, []);

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