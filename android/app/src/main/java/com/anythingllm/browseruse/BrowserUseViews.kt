package com.anythingllm.browseruse

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

/**
 * Where agent WebViews live while nobody is looking at them: a full-size layer behind the app's
 * React root in MainActivity. Being in the window keeps the page rendering and its timers running
 * like a visible tab (a detached or transparent WebView is treated as hidden). An opaque cover on
 * top of the WebViews keeps the page from showing through wherever the app's UI is transparent.
 * It never takes touches from the user and blocks focus so the agent's typing never raises the
 * keyboard.
 */
@SuppressLint("ViewConstructor")
class BrowserUseParking(context: Context) : FrameLayout(context) {
    private val cover = View(context).apply { setBackgroundColor(COVER_COLOR) }

    init {
        descendantFocusability = ViewGroup.FOCUS_BLOCK_DESCENDANTS
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
        isClickable = false
        addView(cover, LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    }

    /** WebViews go under the cover */
    fun park(view: View) {
        addView(view, 0, LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    }

    // Programmatic taps go straight to the WebView; nothing from the screen reaches it here.
    override fun dispatchTouchEvent(ev: MotionEvent?): Boolean = false

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        for (i in 0 until childCount) getChildAt(i).layout(0, 0, right - left, bottom - top)
    }

    companion object {
        private const val TAG_KEY = "anythingllm-browser-use-parking"
        /** The app's background (#0E0F0F) */
        private const val COVER_COLOR = 0xFF0E0F0F.toInt()

        /** The parking layer of `activity`, created behind its content on first use. */
        fun of(activity: Activity): BrowserUseParking? {
            val content = activity.findViewById<ViewGroup>(android.R.id.content) ?: return null
            for (i in 0 until content.childCount) {
                val child = content.getChildAt(i)
                if (child is BrowserUseParking && child.tag == TAG_KEY) return child
            }
            val parking = BrowserUseParking(activity)
            parking.tag = TAG_KEY
            content.addView(parking, 0, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            return parking
        }
    }
}

/**
 * Shows a session's WebView inside the React UI (watch / take over / sign in). The WebView is
 * moved in when the view mounts and handed back to the parking layer when it unmounts, so the
 * page keeps running throughout. `interactive` decides whether the user's touches and keyboard
 * reach the page.
 */
@SuppressLint("ViewConstructor")
class BrowserUseHostView(context: ThemedReactContext) : FrameLayout(context) {
    var sessionId: String? = null
        set(value) {
            if (field == value) return
            release()
            field = value
            claim()
        }
    var interactive: Boolean = false
        set(value) {
            field = value
            descendantFocusability = if (value) ViewGroup.FOCUS_AFTER_DESCENDANTS else ViewGroup.FOCUS_BLOCK_DESCENDANTS
            BrowserUseModule.sessionFor(sessionId)?.setInteractive(value)
        }

    init {
        descendantFocusability = ViewGroup.FOCUS_BLOCK_DESCENDANTS
    }

    private val reactContext: ReactContext get() = context as ReactContext

    private fun claim() {
        if (!isAttachedToWindow) return
        val session = BrowserUseModule.sessionFor(sessionId) ?: return
        val activity = reactContext.currentActivity ?: return
        session.attachTo(this, activity)
        session.setInteractive(interactive)
        layoutChildren()
    }

    private fun release() {
        val session = BrowserUseModule.sessionFor(sessionId) ?: return
        if (session.webView.parent === this) BrowserUseModule.park(session)
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        claim()
    }

    override fun onDetachedFromWindow() {
        release()
        super.onDetachedFromWindow()
    }

    override fun onInterceptTouchEvent(ev: MotionEvent?): Boolean = !interactive
    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent?): Boolean = !interactive

    // React lays this view out but never measures children it did not create - do it ourselves.
    override fun requestLayout() {
        super.requestLayout()
        post(layoutRunnable)
    }

    private val layoutRunnable = Runnable { layoutChildren() }

    private fun layoutChildren() {
        val w = width
        val h = height
        if (w <= 0 || h <= 0) return
        for (i in 0 until childCount) {
            val child = getChildAt(i)
            child.measure(MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(h, MeasureSpec.EXACTLY))
            child.layout(0, 0, w, h)
        }
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        layoutChildren()
    }
}

class BrowserUseHostViewManager : SimpleViewManager<BrowserUseHostView>() {
    override fun getName(): String = "BrowserUseHostView"

    override fun createViewInstance(reactContext: ThemedReactContext): BrowserUseHostView = BrowserUseHostView(reactContext)

    @ReactProp(name = "sessionId")
    fun setSessionId(view: BrowserUseHostView, sessionId: String?) {
        view.sessionId = sessionId
    }

    @ReactProp(name = "interactive", defaultBoolean = false)
    fun setInteractive(view: BrowserUseHostView, interactive: Boolean) {
        view.interactive = interactive
    }

    override fun onDropViewInstance(view: BrowserUseHostView) {
        view.sessionId = null
        super.onDropViewInstance(view)
    }
}
