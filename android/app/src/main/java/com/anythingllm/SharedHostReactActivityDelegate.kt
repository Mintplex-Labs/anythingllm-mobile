package com.anythingllm

import android.util.Log
import com.facebook.react.ReactActivity
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

/**
 * Delegate for every ReactActivity in the app. MainActivity, the Quick Actions card and the assistant
 * overlay share one ReactHost, which tracks a single current activity and throws when asked to pause any
 * other one. Android normally pauses the old activity before resuming the next, but across tasks some
 * devices (Pixel, Xiaomi) deliver the old one's pause after the next one's resume - by then the host has
 * already moved to the new activity, so the late pause has nothing to do and is dropped here instead of
 * crashing the app (Crashlytics ca32e71d). Same rule the host already applies to onHostDestroy(activity).
 */
open class SharedHostReactActivityDelegate(
    activity: ReactActivity,
    mainComponentName: String,
) : DefaultReactActivityDelegate(activity, mainComponentName, fabricEnabled) {

    override fun onPause() {
        try {
            super.onPause()
        } catch (e: AssertionError) {
            // ReactHostImpl.onHostPause: "Pausing an activity that is not the current activity".
            Log.w(TAG, "Dropped a late pause for ${plainActivity.javaClass.simpleName}: ${e.message}")
        }
    }
}

// Top level, not a companion: inside the overlays' `object : SharedHostReactActivityDelegate(this, ...)`
// a companion would shadow the activity as `this`.
private const val TAG = "SharedHostDelegate"
