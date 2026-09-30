package com.anythingllm.assistant

import android.app.role.RoleManager
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.service.voice.VoiceInteractionService
import com.anythingllm.MainActivity
import com.anythingllm.assistant.themes.AssistantThemes
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

/**
 * JS-side controls for the digital assistant: the role status and system settings for the Settings
 * page, and the overlay's controls (screenshot, glow, close). Overlay methods are no-ops when no
 * overlay is showing so the same JS can never break the main app.
 */
class AssistantModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "AssistantModule"

    private fun overlay(): AssistantActivity? = AssistantActivity.current?.get()

    /** Whether the user picked AnythingLLM as the device's digital assistant app. */
    @ReactMethod
    fun isDefaultAssistant(promise: Promise) {
        try {
            val held = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                reactContext.getSystemService(RoleManager::class.java)?.isRoleHeld(RoleManager.ROLE_ASSISTANT) == true
            } else {
                VoiceInteractionService.isActiveService(reactContext, ComponentName(reactContext, AssistantService::class.java))
            }
            promise.resolve(held)
        } catch (e: Exception) {
            promise.reject("ASSISTANT_STATUS_FAILED", e)
        }
    }

    /**
     * Open the system page where the default assistant is picked. Apps cannot request the assistant
     * role with a dialog (unlike browser or SMS), so the user has to choose it there themselves. The
     * digital assistant page also holds the "Use screenshot" switch the screen attachment depends on.
     */
    @ReactMethod
    fun openAssistantSettings(promise: Promise) {
        val candidates = listOf(
            Intent(Settings.ACTION_VOICE_INPUT_SETTINGS),
            Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS),
            Intent(Settings.ACTION_SETTINGS),
        )
        for (intent in candidates) {
            try {
                reactContext.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                promise.resolve(true)
                return
            } catch (_: ActivityNotFoundException) {
            } catch (_: SecurityException) {
            }
        }
        promise.resolve(false)
    }

    /**
     * The screenshot taken of the app under the overlay when the assistant was invoked. Resolves to
     * `{ uri }` once it is saved, or `{ uri: null, reason }` - "disabled" (screenshots are off in the
     * assistant settings), "blocked" (the app on screen does not allow capture), "timeout" or "none".
     */
    @ReactMethod
    fun getScreenshot(promise: Promise) {
        AssistantScreenshot.await { result ->
            val map = Arguments.createMap()
            if (result.path != null) {
                map.putString("uri", Uri.fromFile(File(result.path)).toString())
            } else {
                map.putNull("uri")
                map.putString("reason", result.reason)
            }
            promise.resolve(map)
        }
    }

    /** The theme ids this device can draw (shader themes need Android 13), in picker order. */
    @ReactMethod
    fun getAvailableThemes(promise: Promise) {
        promise.resolve(Arguments.fromList(AssistantThemes.available()))
    }

    /** The background theme the overlay uses - always a known id (see AssistantThemes). */
    @ReactMethod
    fun getTheme(promise: Promise) {
        promise.resolve(AssistantThemes.stored(reactContext))
    }

    /**
     * Save the background theme and apply it to an overlay that is open right now. An unknown id saves
     * the default instead; resolves to the id actually saved.
     */
    @ReactMethod
    fun setTheme(id: String?, promise: Promise) {
        try {
            val saved = AssistantThemes.store(reactContext, id)
            overlay()?.let { activity -> activity.runOnUiThread { activity.glow?.setTheme(saved) } }
            promise.resolve(saved)
        } catch (e: Exception) {
            promise.reject("ASSISTANT_THEME_FAILED", e)
        }
    }

    /** Whether the overlay background moves or is a still picture (default: moves). */
    @ReactMethod
    fun getAnimated(promise: Promise) {
        promise.resolve(AssistantThemes.animated(reactContext))
    }

    /** Save whether the background moves, and apply it to an overlay that is open right now. */
    @ReactMethod
    fun setAnimated(animated: Boolean, promise: Promise) {
        try {
            AssistantThemes.storeAnimated(reactContext, animated)
            overlay()?.let { activity -> activity.runOnUiThread { activity.glow?.setAnimated(animated) } }
            promise.resolve(animated)
        } catch (e: Exception) {
            promise.reject("ASSISTANT_ANIMATED_FAILED", e)
        }
    }

    /** One of AssistantGlowView's states: idle, listening, thinking, hidden. */
    @ReactMethod
    fun setGlowState(state: String) {
        val activity = overlay() ?: return
        activity.runOnUiThread { activity.glow?.setState(state) }
    }

    /** Close the overlay and return to the app underneath. */
    @ReactMethod
    fun finish() {
        val activity = overlay() ?: return
        activity.runOnUiThread { activity.finish() }
    }

    /** Bring the main app to the front (eg: to finish onboarding) and close the overlay. */
    @ReactMethod
    fun openInApp() {
        val activity = overlay()
        val intent = Intent(reactContext, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
        }
        reactContext.startActivity(intent)
        activity?.runOnUiThread { activity.finish() }
    }
}
