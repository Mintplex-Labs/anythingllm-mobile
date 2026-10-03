package com.anythingllm.background

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import com.facebook.react.jstasks.HeadlessJsTaskEventListener
import com.facebook.react.uimanager.ViewManager

/**
 * JS access to BackgroundWorkService: register long-running work so the app keeps running while
 * it is in the background, update what the notification says, and end it.
 * See src/utils/BackgroundWork.
 *
 * The service keeps the process alive, but React Native also pauses its own JS timers
 * (setTimeout) once the app is in the background - every `await sleep()` in the work would hang
 * until the user came back. RN only keeps timers running while a headless JS task is active, so
 * while any work is registered a keep-alive headless task (KEEP_ALIVE_TASK) runs; JS finishes it
 * when the last piece of work ends.
 */
class BackgroundWorkModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    companion object {
        private const val TAG = "BackgroundWorkModule"
        /** Must match BACKGROUND_WORK_KEEP_ALIVE_TASK in src/utils/BackgroundWork */
        private const val KEEP_ALIVE_TASK = "BackgroundWorkKeepAlive"
    }

    private val main = Handler(Looper.getMainLooper())
    /** Tasks this JS runtime registered - dropped if it reloads or goes away */
    private val owned = HashSet<String>()
    /** The running keep-alive headless task, if any */
    private var keepAliveTaskId: Int? = null

    private val headlessListener = object : HeadlessJsTaskEventListener {
        override fun onHeadlessJsTaskStart(taskId: Int) {}
        override fun onHeadlessJsTaskFinish(taskId: Int) {
            if (taskId == keepAliveTaskId) keepAliveTaskId = null
        }
    }

    /** Starts the keep-alive headless task unless one is already running. Main thread. */
    private fun ensureKeepAlive() {
        if (keepAliveTaskId != null || !reactContext.hasActiveReactInstance()) return
        try {
            val headless = HeadlessJsTaskContext.getInstance(reactContext)
            headless.removeTaskEventListener(headlessListener)
            headless.addTaskEventListener(headlessListener)
            // No timeout: JS ends the task itself when the last piece of work ends.
            keepAliveTaskId = headless.startTask(HeadlessJsTaskConfig(KEEP_ALIVE_TASK, Arguments.createMap(), 0, true))
        } catch (e: Exception) {
            Log.w(TAG, "Could not start the keep-alive task - JS timers will pause in the background", e)
        }
    }

    override fun getName(): String = "BackgroundWorkModule"

    /** Translated notification texts: the channel name and the "+N more" label (a %d format). */
    @ReactMethod
    fun configure(channelName: String, moreTasks: String, promise: Promise) {
        main.post {
            BackgroundWorkService.configure(channelName, moreTasks)
            promise.resolve(true)
        }
    }

    /** Starts or updates a task. Resolves false when Android would not start the service (app in the background). */
    @ReactMethod
    fun upsert(id: String, title: String, body: String, promise: Promise) {
        main.post {
            owned.add(id)
            ensureKeepAlive()
            promise.resolve(BackgroundWorkService.upsert(reactContext.applicationContext, id, title, body))
        }
    }

    @ReactMethod
    fun end(id: String, promise: Promise) {
        main.post {
            owned.remove(id)
            // JS finishes the keep-alive task itself now; forget it so work started before that lands gets a new one.
            if (owned.isEmpty()) keepAliveTaskId = null
            BackgroundWorkService.remove(reactContext.applicationContext, id)
            promise.resolve(true)
        }
    }

    override fun invalidate() {
        main.post {
            for (id in owned) BackgroundWorkService.remove(reactContext.applicationContext, id)
            owned.clear()
        }
        super.invalidate()
    }
}

class BackgroundWorkPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = listOf(BackgroundWorkModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
