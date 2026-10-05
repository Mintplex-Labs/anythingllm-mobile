package com.anythingllm.assistant

import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.os.Bundle
import android.view.ViewGroup
import android.view.WindowManager
import androidx.core.view.WindowCompat
import com.anythingllm.SharedHostReactActivityDelegate
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import java.lang.ref.WeakReference

/**
 * The assistant overlay: the `AnythingLLMAssistant` React root drawn over the app the user invoked
 * the assistant from, over a dim and the color wash (AssistantGlowView). Translucent, in its own task and
 * out of recents, like the Quick Actions card - and like it, it shares the app's ReactHost, so it runs
 * in the main app's JS runtime with the same loaded on-device model.
 *
 * Started by AssistantSession for every invocation; AssistantModule is the way back from JS.
 */
class AssistantActivity : ReactActivity() {

    companion object {
        const val COMPONENT_NAME = "AnythingLLMAssistant"
        const val EXTRA_INVOCATION = "invocation"
        /** Dim under the color wash, like Circle to Search - the app underneath stays readable, it is what the user is asking about. */
        private val SCRIM = Color.argb(90, 0, 0, 0)
        /** The overlay currently on screen, for AssistantModule. */
        var current: WeakReference<AssistantActivity>? = null
    }

    var glow: AssistantGlowView? = null
        private set

    override fun getMainComponentName(): String = COMPONENT_NAME

    override fun createReactActivityDelegate(): ReactActivityDelegate =
        object : SharedHostReactActivityDelegate(this, mainComponentName) {
            override fun getLaunchOptions(): Bundle = Bundle().apply {
                putDouble("invocation", (intent?.getLongExtra(EXTRA_INVOCATION, 0L) ?: 0L).toDouble())
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        // Draw under the system bars and the camera cutout so the glow reaches the physical edges.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }
        // The dim is the window background so it sits under the glow; the React root draws no backdrop.
        window.setBackgroundDrawable(ColorDrawable(SCRIM))
        // Same as MainActivity: never restore react-native-screens fragments.
        super.onCreate(null)
        current = WeakReference(this)
        // Below the React root, so the overlay card is drawn over the glow.
        glow = AssistantGlowView(this).also {
            findViewById<ViewGroup>(android.R.id.content)
                .addView(it, 0, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        }
    }

    override fun onDestroy() {
        // A newer invocation replaces this overlay (CLEAR_TASK) and keeps the session; only the last one ends it.
        if (current?.get() === this) {
            current = null
            AssistantSession.current?.get()?.finish()
        }
        super.onDestroy()
    }
}
