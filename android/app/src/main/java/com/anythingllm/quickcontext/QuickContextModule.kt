package com.anythingllm.quickcontext

import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import com.anythingllm.MainActivity
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * JS-side controls for the Quick Actions card (see QuickContextActivity). Every method is a no-op
 * when no card is showing so the same JS can never break the main app.
 */
class QuickContextModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "QuickContextModule"

    private fun card(): QuickContextActivity? = QuickContextActivity.current?.get()

    private val component: ComponentName
        get() = ComponentName(reactContext, QuickContextActivity::class.java)

    /** Close the card and return to the calling app. */
    @ReactMethod
    fun finish() {
        val activity = card() ?: return
        activity.runOnUiThread { activity.finish() }
    }

    /**
     * Bring the main app to the front and close the card. When JS has queued a navigation to a saved
     * Quick Actions thread (`resetToWhenReady`), the main app applies it once its navigator is ready
     * - immediately when it is already running, after start-up otherwise.
     */
    @ReactMethod
    fun openInApp() {
        val activity = card()
        val intent = Intent(reactContext, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
        }
        reactContext.startActivity(intent)
        activity?.runOnUiThread { activity.finish() }
    }

    /**
     * Whether "Ask with AnythingLLM" is offered in other apps' text-selection toolbars. Read from the
     * package manager rather than a stored preference: the component state is the single source of
     * truth and survives updates. The manifest default (no explicit state) counts as enabled.
     */
    @ReactMethod
    fun isEnabled(promise: Promise) {
        val state = reactContext.packageManager.getComponentEnabledSetting(component)
        promise.resolve(
            state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT ||
                state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED
        )
    }

    /**
     * Show or hide the toolbar entry. Disabling the activity component removes us from the apps that
     * resolve ACTION_PROCESS_TEXT, so the entry disappears from every selection toolbar at once
     * (the same mechanism Translate and Grammarly use for theirs). Takes effect immediately without
     * killing the app; the state persists across restarts and app updates.
     */
    @ReactMethod
    fun setEnabled(enabled: Boolean, promise: Promise) {
        try {
            reactContext.packageManager.setComponentEnabledSetting(
                component,
                if (enabled) PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP,
            )
            promise.resolve(enabled)
        } catch (e: Exception) {
            promise.reject("QUICK_CONTEXT_TOGGLE_FAILED", e)
        }
    }
}
