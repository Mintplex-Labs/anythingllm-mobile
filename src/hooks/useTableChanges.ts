import { useEffect, useRef } from 'react';
import { database } from '@/database';

/**
 * Calls `onChange` whenever any row in `tables` is created, updated or deleted - a cheap way
 * for a screen to refetch its plain-object data when the database moves under it (eg: a
 * scheduled job run finishing in the background while its list is on screen).
 */
export default function useTableChanges(tables: string[], onChange: () => void) {
    const callback = useRef(onChange);
    callback.current = onChange;
    const key = tables.join(',');
    useEffect(() => {
        const subscription = database.withChangesForTables(tables).subscribe({
            next: (changes) => { if (changes) callback.current(); },
            error: (error) => console.log('[useTableChanges] observe failed', error),
        });
        return () => subscription.unsubscribe();
    }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}
