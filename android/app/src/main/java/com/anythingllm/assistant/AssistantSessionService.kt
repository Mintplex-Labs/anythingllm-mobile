package com.anythingllm.assistant

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.os.Build
import android.os.Bundle
import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService
import android.util.Log
import java.lang.ref.WeakReference

class AssistantSessionService : VoiceInteractionSessionService() {
    override fun onNewSession(args: Bundle?): VoiceInteractionSession = AssistantSession(this)
}

/**
 * One assist invocation (or several - the system re-shows a live session instead of making a new one).
 * The session has no window of its own: the UI is AssistantActivity, a translucent React root, so the
 * overlay is built from the same components as the rest of the app. The session's job is to launch it
 * and to hand over the screenshot the system takes of the app underneath (see AssistantScreenshot).
 */
class AssistantSession(context: Context) : VoiceInteractionSession(context) {

    companion object {
        private const val TAG = "AssistantSession"
        /** The live session, so the overlay can end it when it closes. */
        var current: WeakReference<AssistantSession>? = null
    }

    private var invocation = 0L

    override fun onCreate() {
        super.onCreate()
        // No session window: it would sit above the activity and swallow its touches.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) setUiEnabled(false)
        current = WeakReference(this)
    }

    override fun onShow(args: Bundle?, showFlags: Int) {
        super.onShow(args, showFlags)
        invocation = AssistantScreenshot.begin(context, (showFlags and SHOW_WITH_SCREENSHOT) != 0)
        // A fresh overlay per invocation (CLEAR_TASK) so every assist starts a new conversation.
        val intent = Intent(context, AssistantActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            .putExtra(AssistantActivity.EXTRA_INVOCATION, invocation)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startAssistantActivity(intent) else context.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Could not open the assistant overlay", e)
            finish()
        }
    }

    /** Called once per show when screenshots are allowed - with null when the app on screen is secure. */
    override fun onHandleScreenshot(screenshot: Bitmap?) {
        AssistantScreenshot.deliver(context, invocation, screenshot)
    }

    override fun onDestroy() {
        if (current?.get() === this) current = null
        super.onDestroy()
    }
}
