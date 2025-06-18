import React, { createContext, useContext, useRef, useState, useCallback } from 'react';
import { BottomSheetModal } from '@gorhom/bottom-sheet';

type BottomSheetType = 'primary-prompt-input' | 'model-chip-selection' | null;

interface BottomSheetContextType {
    activeSheet: BottomSheetType;
    registerSheet: (type: BottomSheetType, ref: React.RefObject<BottomSheetModal>) => void;
    unregisterSheet: (type: BottomSheetType) => void;
    presentSheet: (type: BottomSheetType) => void;
    dismissSheet: (type: BottomSheetType) => void;
}

const BottomSheetContext = createContext<BottomSheetContextType | null>(null);

export function BottomSheetProvider({ children }: { children: React.ReactNode }) {
    const [activeSheet, setActiveSheet] = useState<BottomSheetType>(null);
    const sheetRefs = useRef<Map<BottomSheetType, React.RefObject<BottomSheetModal>>>(new Map());

    const registerSheet = useCallback((type: BottomSheetType, ref: React.RefObject<BottomSheetModal>) => {
        sheetRefs.current.set(type, ref);
    }, []);

    const unregisterSheet = useCallback((type: BottomSheetType) => {
        sheetRefs.current.delete(type);
    }, []);

    const presentSheet = useCallback((type: BottomSheetType) => {
        if (activeSheet === type) return;
        console.log('presenting sheet', type);
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

    return (
        <BottomSheetContext.Provider
            value={{
                activeSheet,
                registerSheet,
                unregisterSheet,
                presentSheet,
                dismissSheet,
            }}
        >
            {children}
        </BottomSheetContext.Provider>
    );
}

export function useBottomSheet() {
    const context = useContext(BottomSheetContext);
    if (!context) {
        throw new Error('useBottomSheet must be used within a BottomSheetProvider');
    }
    return context;
} 