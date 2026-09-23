import { useCallback, useEffect, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import useRedirect from '@/hooks/useRedirect';
import { PATHS } from '@/utils/paths';
import JobList from './JobList';
import JobForm from './JobForm';
import JobRuns from './JobRuns';
import RunDetail from './RunDetail';

/**
 * Pages of the scheduled jobs screen. Like the settings screens there is no nested navigator -
 * a single drawer route swaps between pages in local state:
 *   list  -> runs (tap a job)  -> run (tap a run)
 *   list  -> form (new job)      runs -> form (edit job)
 */
export type ScheduledJobsPage =
    | { name: 'list' }
    | { name: 'form'; jobUuid?: string; from: 'list' | 'runs' }
    | { name: 'runs'; jobUuid: string }
    | { name: 'run'; jobUuid: string; runUuid: string };

/** Params a notification tap (or redirect) can open the screen with */
export type ScheduledJobsRouteParams = { jobUuid?: string; runUuid?: string } | undefined;

export default function ScheduledJobs() {
    useRedirect();
    const navigation = useNavigation();
    const route = useRoute();
    const [page, setPage] = useState<ScheduledJobsPage>({ name: 'list' });

    // A tapped notification carries the run to open - params change again when a second one is tapped while we are on screen.
    const params = route.params as ScheduledJobsRouteParams;
    useEffect(() => {
        if (!params?.jobUuid) return;
        if (params.runUuid) setPage({ name: 'run', jobUuid: params.jobUuid, runUuid: params.runUuid });
        else setPage({ name: 'runs', jobUuid: params.jobUuid });
        // Consume the params so re-rendering (or coming back later) does not re-open the run.
        // @ts-ignore - params are untyped on the drawer route
        navigation.setParams({ jobUuid: undefined, runUuid: undefined });
    }, [params?.jobUuid, params?.runUuid]); // eslint-disable-line react-hooks/exhaustive-deps

    const exit = useCallback(() => {
        navigation.reset({
            index: 0,
            // @ts-ignore
            routes: [{ name: PATHS.home }],
        });
    }, [navigation]);

    switch (page.name) {
        case 'form':
            return (
                <JobForm
                    jobUuid={page.jobUuid}
                    onDone={(savedJobUuid) => {
                        if (page.from === 'runs' && savedJobUuid) setPage({ name: 'runs', jobUuid: savedJobUuid });
                        else setPage({ name: 'list' });
                    }}
                    onCancel={() => (page.from === 'runs' && page.jobUuid ? setPage({ name: 'runs', jobUuid: page.jobUuid }) : setPage({ name: 'list' }))}
                />
            );
        case 'runs':
            return (
                <JobRuns
                    jobUuid={page.jobUuid}
                    onBack={() => setPage({ name: 'list' })}
                    onEdit={() => setPage({ name: 'form', jobUuid: page.jobUuid, from: 'runs' })}
                    onOpenRun={(runUuid) => setPage({ name: 'run', jobUuid: page.jobUuid, runUuid })}
                />
            );
        case 'run':
            return (
                <RunDetail
                    jobUuid={page.jobUuid}
                    runUuid={page.runUuid}
                    onBack={() => setPage({ name: 'runs', jobUuid: page.jobUuid })}
                />
            );
        case 'list':
        default:
            return (
                <JobList
                    onBack={exit}
                    onCreate={() => setPage({ name: 'form', from: 'list' })}
                    onOpenJob={(jobUuid) => setPage({ name: 'runs', jobUuid })}
                />
            );
    }
}
