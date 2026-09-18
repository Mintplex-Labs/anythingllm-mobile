import { useEffect, useState } from 'react';
import ScheduledJobRun from '@/database/models/ScheduledJobRun';

/**
 * Live count of finished scheduled job runs the user has not opened yet - for one job, or
 * across every job when `jobUuid` is omitted. Drives the unseen dots on the sidebar icon,
 * the job rows and the run rows. Re-emits whenever the runs table changes.
 */
export default function useUnreadScheduledJobRuns(jobUuid?: string): number {
    const [count, setCount] = useState(0);
    useEffect(() => {
        const subscription = ScheduledJobRun.unreadQuery(jobUuid).observeCount(false).subscribe({
            next: (value) => setCount(value),
            error: (error) => console.log('[useUnreadScheduledJobRuns] observe failed', error),
        });
        return () => subscription.unsubscribe();
    }, [jobUuid]);
    return count;
}
