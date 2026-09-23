package com.anythingllm.quickcontext

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import com.anythingllm.R
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import java.lang.ref.WeakReference

/**
 * "Quick Actions": the "Ask with AnythingLLM" entry in the text-selection toolbar of any app
 * (ACTION_PROCESS_TEXT) - edit or summarize the highlighted text. Renders the `AnythingLLMQuickContext`
 * React root as a card over the calling app - the activity is translucent (see QuickContextTheme) and
 * lives in its own task so the main app is never pulled to the front.
 *
 * It shares the app's ReactHost, so the card runs in the same JS runtime as the main app: same
 * loaded on-device model, same providers. The selected text is handed to JS as initial props;
 * `QuickContextModule` covers the way back (bring the main app forward, close).
 */
class QuickContextActivity : ReactActivity() {

    companion object {
        const val COMPONENT_NAME = "AnythingLLMQuickContext"
        /** The card currently on screen, for QuickContextModule. */
        var current: WeakReference<QuickContextActivity>? = null
    }

    override fun getMainComponentName(): String = COMPONENT_NAME

    override fun createReactActivityDelegate(): ReactActivityDelegate =
        object : DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled) {
            override fun getLaunchOptions(): Bundle = Bundle().apply {
                putString("selectedText", intent?.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString() ?: "")
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        // Nothing to work with (should not happen - the toolbar only offers us a non-empty selection).
        val text = intent?.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString()
        if (text.isNullOrBlank()) {
            Toast.makeText(this, R.string.quick_actions_empty_hint, Toast.LENGTH_SHORT).show()
            super.onCreate(null)
            finish()
            return
        }

        // The card opens for every selection, editable or not: the result is copied, never returned as
        // a PROCESS_TEXT result. Hosts apply a returned result inconsistently (Chromium appends it at
        // the caret, custom editors such as LinkedIn's ignore it) while finishing without one leaves
        // the host's selection intact, so Paste replaces it.

        // Same as MainActivity: never restore react-native-screens fragments.
        super.onCreate(null)
        current = WeakReference(this)
    }

    override fun onDestroy() {
        if (current?.get() === this) current = null
        super.onDestroy()
    }
}
