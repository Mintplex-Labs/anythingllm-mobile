package com.anythingllm.scheduledjobs

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
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

    /**
     * Whether the app's battery setting is "Unrestricted" (exempt from battery optimization). When it is
     * not, Doze can cut the app's network mid-run while the phone is locked, failing background jobs.
     */
    @ReactMethod
    fun isIgnoringBatteryOptimizations(promise: Promise) {
        try {
            val powerManager = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            promise.resolve(powerManager.isIgnoringBatteryOptimizations(reactApplicationContext.packageName))
        } catch (e: Exception) {
            Log.e(TAG, "Failed to read battery optimization state", e)
            promise.reject("battery_state_failed", e.message, e)
        }
    }

    /**
     * Opens this app's system App info page, where Battery > Unrestricted lives. Used instead of
     * ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, which Play only allows for a narrow set of apps.
     */
    @ReactMethod
    fun openBatterySettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", reactApplicationContext.packageName, null))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open battery settings", e)
            promise.reject("open_settings_failed", e.message, e)
        }
    }

    companion object {
        private const val TAG = "ScheduledJobsModule"
    }
}
