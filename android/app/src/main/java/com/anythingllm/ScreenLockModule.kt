package com.anythingllm

import android.app.KeyguardManager
import android.content.Context
import android.os.PowerManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Reports whether the device is currently locked (screen off, or the keyguard is showing).
 * Used to decide if a finished chat reply should be surfaced as a notification - a user who
 * merely switched apps has not "locked their phone" and should not be buzzed.
 */
class ScreenLockModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ScreenLockModule"

    @ReactMethod
    fun isLocked(promise: Promise) {
        try {
            val keyguard = reactContext.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
            val power = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            // Screen off counts as locked even on devices with no lock screen security.
            promise.resolve(keyguard.isKeyguardLocked || !power.isInteractive)
        } catch (e: Exception) {
            promise.reject("screen_lock_error", "Could not read screen lock state", e)
        }
    }
}
