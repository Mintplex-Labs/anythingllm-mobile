package com.anythingllm.scheduledjobs

import android.content.Context
import android.util.Log
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * Arms a single WorkManager one-time request for the next scheduled job run.
 *
 * WorkManager was chosen over AlarmManager on purpose: it needs no permissions (no exact alarm,
 * no boot receiver of our own - the library re-enqueues pending work after a reboot itself) and
 * plays by Doze rules. The cost is timing: a run can land some minutes after its scheduled
 * minute when the device is idle. Jobs run in the app process through a headless JS task, so
 * the whole JS runner is reused unchanged.
 */
object ScheduledJobsScheduler {
    private const val TAG = "ScheduledJobsScheduler"
    /** Unique work name - only ever one pending wake-up, always for the earliest due job. */
    const val WORK_NAME = "anythingllm-scheduled-jobs"

    fun schedule(context: Context, atMillis: Long) {
        val delay = (atMillis - System.currentTimeMillis()).coerceAtLeast(0L)
        val request = OneTimeWorkRequestBuilder<ScheduledJobsWorker>()
            .setInitialDelay(delay, TimeUnit.MILLISECONDS)
            // Every job talks to an external LLM - no point waking up offline.
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .addTag(WORK_NAME)
            .build()
        val workManager = WorkManager.getInstance(context)
        // JS re-arms the schedule at the end of every pass - including the pass a running worker
        // started. REPLACE would cancel that worker mid-flight, so queue behind it instead.
        val policy = if (ScheduledJobsWorker.running.get()) ExistingWorkPolicy.APPEND_OR_REPLACE else ExistingWorkPolicy.REPLACE
        workManager.enqueueUniqueWork(WORK_NAME, policy, request)
        Log.d(TAG, "Scheduled jobs wake-up in ${delay / 1000}s ($policy)")
    }


    fun cancel(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
        Log.d(TAG, "Scheduled jobs wake-up cancelled")
    }
}
