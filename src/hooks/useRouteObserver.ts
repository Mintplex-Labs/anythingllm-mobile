import { useNavigation } from '@react-navigation/native';
import { useEffect, useRef } from 'react';
import { useBottomSheet } from '@/contexts/BottomSheetContext';

/**
 * Hook that dismisses all bottom sheets when the navigation route changes
 */
export default function useRouteObserver() {
    const navigation = useNavigation();
    const { dismissAllSheets } = useBottomSheet();
    const previousRouteRef = useRef<string | null>(null);

    useEffect(() => {
        const unsubscribe = navigation.addListener('state', (e) => {
            const currentRoute = e.data.state?.routes?.[e.data.state.index]?.name;
            if (previousRouteRef?.current !== currentRoute) dismissAllSheets();
            previousRouteRef.current = currentRoute;
        });

        return unsubscribe;
    }, [navigation, dismissAllSheets]);

    return {
        currentRoute: navigation.getState()?.routes[navigation.getState()?.index ?? 0]?.name ?? null,
        previousRoute: previousRouteRef.current ?? null,
    }
} 