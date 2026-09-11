import { createContext, ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react";

/**
 * Remembers which activity chains the user has expanded, keyed by chat uuid.
 * Lives above the list so a chain keeps its open state when the FlatList
 * recycles the row or the message transitions from streaming to saved
 * (desktop `ThoughtExpansionProvider`).
 */
type ExpansionContextValue = {
    isExpanded: (chatId?: string) => boolean;
    setExpanded: (chatId: string | undefined, expanded: boolean) => void;
}
const ActivityExpansionContext = createContext<ExpansionContextValue | null>(null);

export function ActivityExpansionProvider({ children }: { children: ReactNode }) {
    const [states, setStates] = useState<Record<string, boolean>>({});
    const statesRef = useRef(states);
    statesRef.current = states;

    const isExpanded = useCallback((chatId?: string) => (chatId ? states[chatId] ?? false : false), [states]);
    const setExpanded = useCallback((chatId: string | undefined, expanded: boolean) => {
        if (!chatId) return;
        if (statesRef.current[chatId] === expanded) return;
        setStates((prev) => ({ ...prev, [chatId]: expanded }));
    }, []);

    const value = useMemo(() => ({ isExpanded, setExpanded }), [isExpanded, setExpanded]);
    return <ActivityExpansionContext.Provider value={value}>{children}</ActivityExpansionContext.Provider>;
}

/**
 * Open state for one chain. Falls back to local state when rendered outside the
 * provider so the component still works in isolation.
 */
export function useActivityExpansion(chatId?: string): { expanded: boolean; setExpanded: (next: boolean) => void } {
    const context = useContext(ActivityExpansionContext);
    const [local, setLocal] = useState(false);
    const contextSet = context?.setExpanded;
    const setExpanded = useCallback((next: boolean) => {
        if (contextSet && chatId) contextSet(chatId, next);
        else setLocal(next);
    }, [contextSet, chatId]);

    if (!context || !chatId) return { expanded: local, setExpanded };
    return { expanded: context.isExpanded(chatId), setExpanded };
}
