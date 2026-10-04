package com.anythingllm.browseruse

import android.annotation.SuppressLint
import android.content.Context
import android.content.MutableContextWrapper
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Base64
import android.util.Log
import android.view.InputDevice
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import java.io.ByteArrayOutputStream

/**
 * One browser agent session: a WebView on a profile, the mobile counterpart of the desktop
 * BrowserSession (electron/main/utils/BrowserUse/session.ts).
 *
 * This class only provides primitives - load, read the page through the page script, tap, drag,
 * capture. The action logic (what "click [12]" means, settling, outcome text) lives in JS
 * (src/utils/BrowserUse/session) so it stays a close port of the desktop code.
 *
 * The WebView always sits in a window so it renders and runs timers like a visible tab: parked
 * behind the app's UI (see BrowserUseParking) or shown in a BrowserUseHostView when the user
 * watches or takes over. Taps are real touch events dispatched to the view; parked WebViews
 * cannot take focus, so no keyboard ever pops up for the agent's typing.
 *
 * Main thread only.
 */
@SuppressLint("SetJavaScriptEnabled")
class BrowserUseSession(
    val id: String,
    val profileId: String,
    context: Context,
    private val profiles: BrowserUseProfiles,
    private val pageScript: () -> String,
    private val initScript: () -> String,
    private val onStatus: (BrowserUseSession) -> Unit,
) {
    companion object {
        private const val TAG = "BrowserUseSession"
        private const val MAX_NOTICES = 20
    }

    /** Swapped to the current activity whenever the view is attached, so <select> and other native popups have a window token */
    val contextWrapper = MutableContextWrapper(context)
    val webView: WebView = WebView(contextWrapper)
    private val handler = Handler(Looper.getMainLooper())
    private val notices = ArrayList<String>()
    var loading = false
        private set
    var progress = 0
        private set
    /** The renderer died (out of memory) - the session cannot be used anymore */
    var crashed = false
        private set
    var closed = false
        private set

    init {
        // Must be the very first call on a new WebView.
        profiles.applyTo(webView, profileId)
        configure()
    }

    private fun configure() {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.mediaPlaybackRequiresUserGesture = true
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.allowFileAccessFromFileURLs = false
        settings.allowUniversalAccessFromFileURLs = false
        settings.setGeolocationEnabled(false)
        // target=_blank links load in this tab; scripted popups are blocked.
        settings.setSupportMultipleWindows(false)
        settings.javaScriptCanOpenWindowsAutomatically = false
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.setSupportZoom(true)
        settings.builtInZoomControls = true
        settings.displayZoomControls = false
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        settings.userAgentString = cleanUserAgent(settings.userAgentString)
        if (WebViewFeature.isFeatureSupported(WebViewFeature.REQUESTED_WITH_HEADER_ALLOW_LIST)) {
            // Never tell sites which app the WebView belongs to.
            WebSettingsCompat.setRequestedWithHeaderOriginAllowList(settings, emptySet())
        }
        profiles.cookieManager(profileId).setAcceptThirdPartyCookies(webView, true)
        webView.setBackgroundColor(Color.WHITE)
        webView.isFocusable = true
        webView.isFocusableInTouchMode = true

        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(webView, initScript(), setOf("*"))
        }

        webView.setDownloadListener { url, _, contentDisposition, mimeType, _ ->
            val name = android.webkit.URLUtil.guessFileName(url, contentDisposition, mimeType)
            notice("A download of \"$name\" was blocked. Files cannot be downloaded.")
        }

        // What pages may do, and how their events reach this session (see BrowserUseClients.kt).
        webView.webViewClient = AgentWebViewClient(this)
        webView.webChromeClient = AgentChromeClient(this)
    }

    /////////////////////////////
    // Page events (from BrowserUseClients)
    /////////////////////////////

    internal fun onPageStarted() {
        loading = true
        // Without DOCUMENT_START_SCRIPT the init script goes in as early as we can get it.
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) webView.evaluateJavascript(initScript(), null)
        onStatus(this)
    }

    internal fun onPageFinished(url: String?) {
        loading = false
        profiles.recordVisit(profileId, url)
        onStatus(this)
    }

    internal fun onVisited(url: String?) {
        profiles.recordVisit(profileId, url)
        onStatus(this)
    }

    internal fun onProgress(newProgress: Int) {
        progress = newProgress
        if (newProgress >= 100) loading = false
        onStatus(this)
    }

    internal fun onStatusChanged() = onStatus(this)

    /** The renderer died (usually out of memory). */
    internal fun onRendererGone(didCrash: Boolean) {
        Log.w(TAG, "Renderer gone for $id (crash=$didCrash)")
        crashed = true
        onStatus(this)
        destroyView()
    }

    /////////////////////////////
    // Notices: what the page did that the agent did not see (dialogs, blocked links...)
    /////////////////////////////

    fun notice(text: String) {
        notices.add(text)
        while (notices.size > MAX_NOTICES) notices.removeAt(0)
    }

    fun takeNotices(): List<String> {
        val out = ArrayList(notices)
        notices.clear()
        return out
    }

    /** Chrome's UA without the WebView markers ("; wv", "Version/4.0") that get sites to block us. */
    private fun cleanUserAgent(ua: String): String =
        ua.replace("; wv)", ")").replace(Regex("\\sVersion/\\d+(\\.\\d+)*"), "")

    /////////////////////////////
    // Page access
    /////////////////////////////

    /**
     * Evaluates `call` against the page script (window.__bu) in the top frame. The callback gets the
     * JSON value of the expression, or a JSON `{"__error": ...}` when it threw.
     */
    fun page(call: String, callback: (String?) -> Unit) {
        if (crashed || closed) return callback(null)
        val script = "(function(){${pageScript()}\n;try{return ($call);}catch(e){return {__error:String(e&&e.message||e)};}})()"
        webView.evaluateJavascript(script) { result -> callback(result) }
    }

    /** Pixels per CSS pixel, from the page's own viewport width. */
    private fun scaleFor(viewportWidth: Double): Float {
        val width = webView.width
        if (viewportWidth <= 0 || width <= 0) return webView.resources.displayMetrics.density
        return (width / viewportWidth).toFloat()
    }

    private fun touch(action: Int, downTime: Long, x: Float, y: Float) {
        val event = MotionEvent.obtain(downTime, SystemClock.uptimeMillis(), action, x, y, 0)
        event.source = InputDevice.SOURCE_TOUCHSCREEN
        webView.dispatchTouchEvent(event)
        event.recycle()
    }

    /** A real tap at CSS coordinates (x, y) of a page whose viewport is `viewportWidth` CSS px wide. */
    fun tap(x: Double, y: Double, viewportWidth: Double, done: () -> Unit) {
        if (crashed || closed) return done()
        val scale = scaleFor(viewportWidth)
        val px = (x * scale).toFloat()
        val py = (y * scale).toFloat()
        val downTime = SystemClock.uptimeMillis()
        touch(MotionEvent.ACTION_DOWN, downTime, px, py)
        handler.postDelayed({
            if (!crashed && !closed) touch(MotionEvent.ACTION_UP, downTime, px, py)
            done()
        }, 60L + (Math.random() * 50).toLong())
    }

    /**
     * Drags the content under (x, y) by `deltaCss` CSS px (positive scrolls down), slowly and with a
     * pause before lifting so it does not fling further than asked.
     */
    fun drag(x: Double, y: Double, deltaCss: Double, viewportWidth: Double, done: () -> Unit) {
        if (crashed || closed) return done()
        val scale = scaleFor(viewportWidth)
        val height = webView.height.toFloat().coerceAtLeast(1f)
        val distance = (deltaCss * scale).toFloat().coerceIn(-height * 0.8f, height * 0.8f)
        val px = (x * scale).toFloat().coerceIn(1f, webView.width.toFloat().coerceAtLeast(2f) - 1f)
        val center = (y * scale).toFloat().coerceIn(height * 0.1f, height * 0.9f)
        val startY = (center + distance / 2).coerceIn(1f, height - 1f)
        val endY = (center - distance / 2).coerceIn(1f, height - 1f)
        val steps = 10
        val downTime = SystemClock.uptimeMillis()
        touch(MotionEvent.ACTION_DOWN, downTime, px, startY)
        for (i in 1..steps) {
            handler.postDelayed({
                if (!crashed && !closed) touch(MotionEvent.ACTION_MOVE, downTime, px, startY + (endY - startY) * i / steps)
            }, i * 16L)
        }
        // Holding still at the end brings the fling velocity to ~0.
        handler.postDelayed({
            if (!crashed && !closed) touch(MotionEvent.ACTION_MOVE, downTime, px, endY)
        }, steps * 16L + 120L)
        handler.postDelayed({
            if (!crashed && !closed) touch(MotionEvent.ACTION_UP, downTime, px, endY)
            done()
        }, steps * 16L + 160L)
    }

    /** A small JPEG (base64) of what the WebView shows, `width` px wide. Null when it has no size yet. */
    fun capture(width: Int, quality: Int): String? {
        if (crashed || closed) return null
        val viewWidth = webView.width
        val viewHeight = webView.height
        if (viewWidth <= 0 || viewHeight <= 0) return null
        return try {
            val scale = width.toFloat() / viewWidth
            val bitmap = Bitmap.createBitmap(width, (viewHeight * scale).toInt().coerceAtLeast(1), Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            canvas.scale(scale, scale)
            canvas.translate(-webView.scrollX.toFloat(), -webView.scrollY.toFloat())
            webView.draw(canvas)
            val out = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)
            bitmap.recycle()
            Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
        } catch (e: Exception) {
            Log.w(TAG, "Capture failed", e)
            null
        }
    }

    /** Lets the user (or nobody) drive the page: parked WebViews never take focus, so no keyboard appears for agent typing. */
    fun setInteractive(interactive: Boolean) {
        if (!interactive && webView.hasFocus()) webView.clearFocus()
    }

    fun detachFromParent() {
        (webView.parent as? ViewGroup)?.removeView(webView)
    }

    fun attachTo(parent: ViewGroup, context: Context) {
        if (webView.parent === parent) return
        detachFromParent()
        contextWrapper.baseContext = context
        if (parent is BrowserUseParking) parent.park(webView)
        else parent.addView(webView, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    }

    /** Gives an unattached WebView a size so pages lay out, taps land and captures work. */
    fun layoutDetached(width: Int, height: Int) {
        if (webView.parent != null || width <= 0 || height <= 0) return
        webView.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY))
        webView.layout(0, 0, width, height)
    }

    private fun destroyView() {
        try {
            detachFromParent()
            webView.stopLoading()
            webView.webChromeClient = null
            webView.destroy()
        } catch (e: Exception) {
            Log.w(TAG, "WebView teardown failed", e)
        }
    }

    fun close() {
        if (closed) return
        closed = true
        handler.removeCallbacksAndMessages(null)
        if (!crashed) destroyView()
        profiles.cookieManager(profileId).flush()
    }
}
