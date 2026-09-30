package com.anythingllm.alarms

import android.content.Intent
import android.provider.AlarmClock
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Hands alarms and timers the user approved in chat to the system clock app (Google Clock,
 * Samsung Clock, ...) through the [AlarmClock] intents. The clock app owns them from then on -
 * they ring, snooze and survive reboots without anything running on our side, which is why this
 * needs only the normal `SET_ALARM` permission and no exact-alarm access.
 *
 * The intents are fire-and-forget: we cannot read back, edit or cancel what the clock app holds.
 * All of them need matching `<queries>` entries in the manifest to be visible on Android 11+.
 */
class AlarmModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "AlarmModule"

    /** Starts [intent], rejecting with `clock_unavailable` when no app handles it */
    private fun launch(intent: Intent, promise: Promise) {
        if (reactContext.packageManager.queryIntentActivities(intent, 0).isEmpty()) {
            promise.reject("clock_unavailable", "No clock app can handle ${intent.action}")
            return
        }
        // Launch from the activity when there is one - starting from the application context needs NEW_TASK.
        val activity = reactContext.currentActivity
        if (activity != null) activity.startActivity(intent)
        else reactContext.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        promise.resolve(true)
    }

    /**
     * A one-off alarm at the next [hour]:[minute] (24h, local time) - the clock app has no date
     * field, so callers only use this for times within the next 24 hours.
     */
    @ReactMethod
    fun setAlarm(hour: Int, minute: Int, message: String, promise: Promise) {
        try {
            val intent = Intent(AlarmClock.ACTION_SET_ALARM)
                .putExtra(AlarmClock.EXTRA_HOUR, hour)
                .putExtra(AlarmClock.EXTRA_MINUTES, minute)
                .putExtra(AlarmClock.EXTRA_MESSAGE, message)
                // The user already approved it in chat - do not make them confirm again in the clock app.
                .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
            launch(intent, promise)
        } catch (e: Exception) {
            promise.reject("alarm_error", "Could not set the alarm", e)
        }
    }

    /** A countdown timer of [seconds] (1 to 86400, the intent's limit) */
    @ReactMethod
    fun setTimer(seconds: Int, message: String, promise: Promise) {
        try {
            val intent = Intent(AlarmClock.ACTION_SET_TIMER)
                .putExtra(AlarmClock.EXTRA_LENGTH, seconds.coerceIn(1, 86_400))
                .putExtra(AlarmClock.EXTRA_MESSAGE, message)
                .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
            launch(intent, promise)
        } catch (e: Exception) {
            promise.reject("timer_error", "Could not set the timer", e)
        }
    }

    /** Opens the clock app's alarm list - where an alarm we set can be changed or deleted */
    @ReactMethod
    fun showAlarms(promise: Promise) {
        try {
            launch(Intent(AlarmClock.ACTION_SHOW_ALARMS), promise)
        } catch (e: Exception) {
            promise.reject("alarm_error", "Could not open the clock app", e)
        }
    }

    /** Opens the clock app's running timers */
    @ReactMethod
    fun showTimers(promise: Promise) {
        try {
            launch(Intent(AlarmClock.ACTION_SHOW_TIMERS), promise)
        } catch (e: Exception) {
            promise.reject("timer_error", "Could not open the clock app", e)
        }
    }
}
