package com.anythingllm.scheduledjobs

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactInstanceEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import com.facebook.react.jstasks.HeadlessJsTaskEventListener
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume

/**
 * Runs the `ScheduledJobsTask` headless JS task (registered in index.js) when a scheduled job
 * comes due while the app is closed or backgrounded.
 *
 * Rather than a `HeadlessJsTaskService` (which Android 12+ would need to be a foreground
 * service, with its notification and permission baggage) the JS task is started straight from
 * this worker: WorkManager already gives us a process and up to ten minutes of execution time.
 * If the React runtime is not up yet it is started without any UI.
 */
class ScheduledJobsWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val app = applicationContext as? ReactApplication
        if (app == null) {
            Log.e(TAG, "Application is not a ReactApplication - cannot run scheduled jobs")
            return Result.failure()
        }

        val host = app.reactHost
        if (host == null) {
            Log.e(TAG, "No ReactHost available (new architecture is required) - cannot run scheduled jobs")
            return Result.failure()
        }

        return try {
            running.set(true)
            passFinished = CompletableDeferred()
            Log.d(TAG, "Waking React runtime for scheduled jobs")
            val reactContext = awaitReactContext(host)
            val finished = runHeadlessTask(reactContext)
            if (finished) Log.d(TAG, "Scheduled jobs task finished") else Log.w(TAG, "Scheduled jobs task did not finish in time")
            Result.success()
        } catch (e: CancellationException) {
            // WorkManager stopped us (time limit, constraints lost, replaced) - let it handle the outcome.
            Log.w(TAG, "Scheduled jobs worker cancelled")
            throw e
        } catch (e: Exception) {
            Log.e(TAG, "Scheduled jobs worker failed", e)
            // JS re-arms the schedule on its next foreground pass; retrying here could loop on a broken bundle.
            Result.failure()
        } finally {
            running.set(false)
        }
    }

    /** The live ReactContext, starting the host (headless - no Activity) when it is not running. */
    private suspend fun awaitReactContext(host: ReactHost): ReactContext {
        host.currentReactContext?.let { return it }
        return withTimeoutOrNull(START_TIMEOUT_MS) {
            suspendCancellableCoroutine { continuation ->
                val listener = object : ReactInstanceEventListener {
                    override fun onReactContextInitialized(context: ReactContext) {
                        host.removeReactInstanceEventListener(this)
                        if (continuation.isActive) continuation.resume(context)
                    }
                }
                host.addReactInstanceEventListener(listener)
                continuation.invokeOnCancellation { host.removeReactInstanceEventListener(listener) }
                UiThreadUtil.runOnUiThread { host.start() }
            }
        } ?: throw IllegalStateException("React runtime did not start within ${START_TIMEOUT_MS}ms")
    }

    /**
     * Starts the JS task and suspends until JS reports it done (or the task timeout elapses).
     * JS signals completion explicitly through `ScheduledJobsModule.notifyBackgroundPassFinished`;
     * the headless-task finish listener is kept as a fallback.
     */
    private suspend fun runHeadlessTask(reactContext: ReactContext): Boolean {
        val finished = passFinished ?: CompletableDeferred()
        withContext(Dispatchers.Main) {
            val headless = HeadlessJsTaskContext.getInstance(reactContext)
            var taskId = -1
            val listener = object : HeadlessJsTaskEventListener {
                override fun onHeadlessJsTaskStart(id: Int) {}
                override fun onHeadlessJsTaskFinish(id: Int) {
                    if (id != taskId) return
                    headless.removeTaskEventListener(this)
                    finished.complete(Unit)
                }
            }
            headless.addTaskEventListener(listener)
            val data = Arguments.createMap().apply { putString("trigger", "background") }
            // Allowed in the foreground too: if the user opens the app mid-run the JS runner
            // serializes passes itself, so a second start is harmless.
            taskId = headless.startTask(HeadlessJsTaskConfig(TASK_KEY, data, TASK_TIMEOUT_MS, true))
        }
        return withTimeoutOrNull(TASK_TIMEOUT_MS + 5_000L) { finished.await() } != null
    }

    companion object {
        private const val TAG = "ScheduledJobsWorker"
        /** True while a worker is executing in this process - see [ScheduledJobsScheduler.schedule]. */
        val running = AtomicBoolean(false)
        @Volatile private var passFinished: CompletableDeferred<Unit>? = null

        /** Called by [ScheduledJobsModule] when JS has finished the background pass. */
        fun signalPassFinished() {
            passFinished?.complete(Unit)
        }

        /** Must match SCHEDULED_JOBS_HEADLESS_TASK in src/utils/ScheduledJobs/scheduler.ts */
        private const val TASK_KEY = "ScheduledJobsTask"
        private const val START_TIMEOUT_MS = 30_000L
        /** Under WorkManager's 10 minute cap; JS budgets its own pass at 8 minutes. */
        private const val TASK_TIMEOUT_MS = 9L * 60L * 1000L
    }
}
