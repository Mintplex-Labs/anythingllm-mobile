/**
 * Name of the headless task that runs scheduled jobs while the app is closed. Kept in its own module, free of
 * imports, so index.js can register the task without loading the scheduler (and the chat stack under it) eagerly.
 * Must match TASK_KEY in android/.../scheduledjobs/ScheduledJobsWorker.kt.
 */
export const SCHEDULED_JOBS_HEADLESS_TASK = 'ScheduledJobsTask';
