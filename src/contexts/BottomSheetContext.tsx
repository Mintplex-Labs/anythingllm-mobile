import React, { createContext, useContext, useRef, useState, useCallback } from 'react';
import { BottomSheetModal } from '@gorhom/bottom-sheet';

export const BOTTOM_SHEET_NAMES = {
    PRIMARY_PROMPT_INPUT: 'primary-prompt-input',
    MODEL_CHIP_SELECTION: 'model-chip-selection',
    SETTINGS: 'settings',
} as const;
export type BottomSheetType = (typeof BOTTOM_SHEET_NAMES)[keyof typeof BOTTOM_SHEET_NAMES] | null;

interface BottomSheetContextType {
    activeSheet: BottomSheetType;
    registerSheet: (type: BottomSheetType, ref: React.RefObject<BottomSheetModal>) => void;
    unregisterSheet: (type: BottomSheetType) => void;
    presentSheet: (type: BottomSheetType, force?: boolean) => void;
    dismissSheet: (type: BottomSheetType) => void;
    dismissAllSheets: () => void;
}

const BottomSheetContext = createContext<BottomSheetContextType | null>(null);

export function BottomSheetProvider({ children }: { children: React.ReactNode }) {
    const [activeSheet, setActiveSheet] = useState<BottomSheetType>(null);
    const sheetRefs = useRef<Map<BottomSheetType, React.RefObject<BottomSheetModal>>>(new Map());

    const registerSheet = useCallback((type: BottomSheetType, ref: React.RefObject<BottomSheetModal>) => {
        console.log('registering sheet', type);
        sheetRefs.current.set(type, ref);
    }, []);

    const unregisterSheet = useCallback((type: BottomSheetType) => {
        console.log('unregistering sheet', type);
        sheetRefs.current.delete(type);
    }, []);

    const presentSheet = useCallback((type: BottomSheetType, force: boolean = false) => {
        if (activeSheet === type && !force) return;
        console.log('presenting sheet', { type, force });
        // Dismiss all sheets except the one we are presenting
        sheetRefs.current.forEach((ref, sheetType) => sheetType !== type && ref.current?.dismiss());
        const newRef = sheetRefs.current.get(type);
        if (newRef?.current) {
            newRef.current.present();
            setActiveSheet(type);
        }
    }, [activeSheet]);

    const dismissSheet = useCallback((type: BottomSheetType) => {
        console.log('dismissing sheet', type);
        const ref = sheetRefs.current.get(type);
        if (ref?.current) {
            ref.current.dismiss();
            setActiveSheet(null);
        }
    }, []);

    const dismissAllSheets = useCallback(() => {
        console.log('dismissing all sheets');
        sheetRefs.current.forEach((ref) => ref.current?.dismiss());
        setActiveSheet(null);
    }, []);

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