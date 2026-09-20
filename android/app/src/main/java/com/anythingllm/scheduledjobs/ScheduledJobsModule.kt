package com.anythingllm.scheduledjobs

import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * JS-facing half of background scheduled jobs. JS works out when the next job is due and hands
 * that instant here; we arm a WorkManager one-time request for it (see [ScheduledJobsScheduler]).
 */
class ScheduledJobsModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ScheduledJobsModule"

    /** Arm (or re-arm) the background wake-up for `atMillis` (epoch ms). */
    @ReactMethod
    fun scheduleNextRun(atMillis: Double, promise: Promise) {
        try {
            ScheduledJobsScheduler.schedule(reactApplicationContext, atMillis.toLong())
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to schedule next run", e)
            promise.reject("schedule_failed", e.message, e)
        }
    }

    /**
     * JS finished a background pass. Lets [ScheduledJobsWorker] return right away instead of
     * waiting on React Native's headless-task bookkeeping.
     */
    @ReactMethod
    fun notifyBackgroundPassFinished() {
        ScheduledJobsWorker.signalPassFinished()
    }

    /** Drop any pending background wake-up (no enabled jobs left). */
    @ReactMethod
    fun cancelScheduledRun(promise: Promise) {
        try {
            ScheduledJobsScheduler.cancel(reactApplicationContext)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to cancel scheduled run", e)
            promise.reject("cancel_failed", e.message, e)
        }
    }

    companion object {
        private const val TAG = "ScheduledJobsModule"
    }
}
