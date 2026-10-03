package com.anythingllm.browseruse

import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.webkit.WebViewFeature
import com.anythingllm.MainActivity
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.ViewManager
import org.json.JSONArray

/**
 * Native half of the browser agent ("Browser Use"). Owns the agent's WebView sessions and the
 * browser profiles; the agent loop itself runs in JS (src/utils/BrowserUse).
 *
 * Every method hops to the main looper - WebView must only be touched there.
 */
class BrowserUseModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), LifecycleEventListener {
    companion object {
        private const val TAG = "BrowserUseModule"
        private const val EVAL_TIMEOUT_MS = 20_000L
        const val STATUS_EVENT = "BrowserUseStatus"

        /** Live sessions by id. Main thread only. */
        private val sessions = HashMap<String, BrowserUseSession>()
        private var profileStore: BrowserUseProfiles? = null
        private var pageScript: String = ""
        private var initScript: String = ""

        fun sessionFor(id: String?): BrowserUseSession? = id?.let { sessions[it] }

        /** Back behind the app's UI - called when a host view lets go of a session's WebView. */
        fun park(session: BrowserUseSession) {
            session.setInteractive(false)
            val activity = currentMainActivity ?: return session.detachFromParent()
            val parking = BrowserUseParking.of(activity) ?: return session.detachFromParent()
            session.attachTo(parking, activity)
        }

        private var currentMainActivity: MainActivity? = null
    }

    private val main = Handler(Looper.getMainLooper())
    private val profiles: BrowserUseProfiles
        get() = profileStore ?: BrowserUseProfiles(reactContext.applicationContext).also { profileStore = it }

    init {
        reactContext.addLifecycleEventListener(this)
    }

    override fun getName(): String = "BrowserUseModule"

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    private fun onMain(promise: Promise, block: () -> Unit) {
        main.post {
            try {
                block()
            } catch (e: Exception) {
                Log.e(TAG, "Browser use call failed", e)
                promise.reject("BROWSER_USE_ERROR", e.message ?: e.toString(), e)
            }
        }
    }

    private fun session(id: String): BrowserUseSession {
        val session = sessions[id] ?: throw IllegalStateException("The browser session has ended.")
        if (session.crashed) throw IllegalStateException("The browser page crashed (the phone ran low on memory). Start the browser again.")
        return session
    }

    /** Re-parks sessions in the current MainActivity, which may have been recreated since they started. */
    private fun refreshParking() {
        val activity = reactContext.currentActivity as? MainActivity ?: return
        if (currentMainActivity === activity) return
        currentMainActivity = activity
        val parking = BrowserUseParking.of(activity) ?: return
        for (session in sessions.values) {
            val parent = session.webView.parent
            if (parent == null || parent is BrowserUseParking) session.attachTo(parking, activity)
        }
    }

    private fun emitStatus(session: BrowserUseSession) {
        if (!reactContext.hasActiveReactInstance()) return
        val params = Arguments.createMap().apply {
            putString("sessionId", session.id)
            putString("url", if (session.crashed || session.closed) null else session.webView.url)
            putString("title", if (session.crashed || session.closed) null else session.webView.title)
            putBoolean("loading", session.loading)
            putInt("progress", session.progress)
            putBoolean("canGoBack", !session.crashed && !session.closed && session.webView.canGoBack())
            putBoolean("canGoForward", !session.crashed && !session.closed && session.webView.canGoForward())
            putBoolean("crashed", session.crashed)
        }
        reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(STATUS_EVENT, params)
    }

    override fun onHostResume() {
        main.post { refreshParking() }
    }

    override fun onHostPause() {}

    override fun onHostDestroy() {}

    override fun invalidate() {
        // JS reloaded (dev) or the app is going away - nothing can drive these sessions anymore.
        main.post {
            for (session in sessions.values) session.close()
            sessions.clear()
        }
        super.invalidate()
    }

    /////////////////////////////
    // Setup
    /////////////////////////////

    @ReactMethod
    fun capabilities(promise: Promise) = onMain(promise) {
        promise.resolve(Arguments.createMap().apply {
            putBoolean("multiProfile", BrowserUseProfiles.multiProfileSupported())
            putBoolean("documentStartScript", WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT))
            // The assistant overlay and quick actions run in their own activities with no room for a browser.
            putBoolean("available", reactContext.currentActivity is MainActivity)
        })
    }

    /** The page script (window.__bu) and the document-start script. Set once per JS load, before the first session. */
    @ReactMethod
    fun setScripts(page: String, init: String, promise: Promise) = onMain(promise) {
        pageScript = page
        initScript = init
        promise.resolve(true)
    }

    /////////////////////////////
    // Profiles
    /////////////////////////////

    private fun profileJson(profile: BrowserUseProfiles.Profile) = org.json.JSONObject().apply {
        put("id", profile.id)
        put("name", profile.name)
        put("createdAt", profile.createdAt)
        put("isDefault", profile.id == BrowserUseProfiles.DEFAULT_ID)
        put("siteCount", profile.sites.size)
        put("inUse", sessions.values.any { it.profileId == profile.id })
    }

    @ReactMethod
    fun listProfiles(promise: Promise) = onMain(promise) {
        val out = JSONArray()
        profiles.all().forEach { out.put(profileJson(it)) }
        promise.resolve(out.toString())
    }

    @ReactMethod
    fun createProfile(name: String, promise: Promise) = onMain(promise) {
        promise.resolve(profileJson(profiles.create(name)).toString())
    }

    @ReactMethod
    fun renameProfile(id: String, name: String, promise: Promise) = onMain(promise) {
        profiles.rename(id, name)
        promise.resolve(true)
    }

    @ReactMethod
    fun deleteProfile(id: String, promise: Promise) = onMain(promise) {
        if (sessions.values.any { it.profileId == id }) throw IllegalStateException("This profile is in use by a browser session. Stop it first.")
        profiles.delete(reactContext, id)
        promise.resolve(true)
    }

    @ReactMethod
    fun clearProfile(id: String, promise: Promise) = onMain(promise) {
        if (sessions.values.any { it.profileId == id }) throw IllegalStateException("This profile is in use by a browser session. Stop it first.")
        profiles.clear(reactContext, id)
        promise.resolve(true)
    }

    @ReactMethod
    fun profileSites(id: String, promise: Promise) = onMain(promise) {
        promise.resolve(profiles.sites(id).toString())
    }

    @ReactMethod
    fun forgetSite(id: String, site: String, promise: Promise) = onMain(promise) {
        profiles.forgetSite(id, site)
        promise.resolve(true)
    }

    /////////////////////////////
    // Sessions
    /////////////////////////////

    /** Opens a session on a profile (by id, else by name, else Default). */
    @ReactMethod
    fun start(sessionId: String, profileId: String?, profileName: String?, promise: Promise) = onMain(promise) {
        if (sessions.containsKey(sessionId)) throw IllegalStateException("Session $sessionId already exists.")
        val profile = profiles.get(profileId) ?: profiles.byName(profileName)
        refreshParking()
        val activity = currentMainActivity
        val session = BrowserUseSession(
            id = sessionId,
            profileId = profile.id,
            context = activity ?: reactContext.applicationContext,
            profiles = profiles,
            pageScript = { pageScript },
            initScript = { initScript },
            onStatus = { emitStatus(it) },
        )
        sessions[sessionId] = session
        val parking = activity?.let { BrowserUseParking.of(it) }
        if (parking != null) session.attachTo(parking, activity)
        else {
            val metrics = reactContext.resources.displayMetrics
            session.layoutDetached(metrics.widthPixels, metrics.heightPixels)
        }
        session.webView.loadUrl("about:blank")
        promise.resolve(Arguments.createMap().apply {
            putString("profileId", profile.id)
            putString("profileName", profile.name)
        })
    }

    @ReactMethod
    fun close(sessionId: String, promise: Promise) = onMain(promise) {
        sessions.remove(sessionId)?.close()
        promise.resolve(true)
    }

    @ReactMethod
    fun navigate(sessionId: String, url: String, promise: Promise) = onMain(promise) {
        session(sessionId).webView.loadUrl(url)
        promise.resolve(true)
    }

    /** "back" | "forward" | "reload" | "stop" */
    @ReactMethod
    fun history(sessionId: String, action: String, promise: Promise) = onMain(promise) {
        val view = session(sessionId).webView
        val done = when (action) {
            "back" -> view.canGoBack().also { if (it) view.goBack() }
            "forward" -> view.canGoForward().also { if (it) view.goForward() }
            "reload" -> { view.reload(); true }
            "stop" -> { view.stopLoading(); true }
            else -> false
        }
        promise.resolve(done)
    }

    @ReactMethod
    fun status(sessionId: String, promise: Promise) = onMain(promise) {
        val session = sessions[sessionId] ?: throw IllegalStateException("The browser session has ended.")
        val alive = !session.crashed && !session.closed
        promise.resolve(Arguments.createMap().apply {
            putString("url", if (alive) session.webView.url else null)
            putString("title", if (alive) session.webView.title else null)
            putBoolean("loading", session.loading)
            putInt("progress", session.progress)
            putBoolean("canGoBack", alive && session.webView.canGoBack())
            putBoolean("canGoForward", alive && session.webView.canGoForward())
            putBoolean("crashed", session.crashed)
        })
    }

    /** Runs `call` against window.__bu and resolves with its JSON value (a string), or null. */
    @ReactMethod
    fun page(sessionId: String, call: String, promise: Promise) = onMain(promise) {
        val session = session(sessionId)
        var settled = false
        val timeout = Runnable {
            if (settled) return@Runnable
            settled = true
            promise.reject("BROWSER_USE_TIMEOUT", "The page did not respond in time.")
        }
        main.postDelayed(timeout, EVAL_TIMEOUT_MS)
        session.page(call) { result ->
            if (settled) return@page
            settled = true
            main.removeCallbacks(timeout)
            promise.resolve(result)
        }
    }

    @ReactMethod
    fun tap(sessionId: String, x: Double, y: Double, viewportWidth: Double, promise: Promise) = onMain(promise) {
        session(sessionId).tap(x, y, viewportWidth) { promise.resolve(true) }
    }

    @ReactMethod
    fun drag(sessionId: String, x: Double, y: Double, deltaCss: Double, viewportWidth: Double, promise: Promise) = onMain(promise) {
        session(sessionId).drag(x, y, deltaCss, viewportWidth) { promise.resolve(true) }
    }

    @ReactMethod
    fun capture(sessionId: String, width: Double, quality: Double, promise: Promise) = onMain(promise) {
        promise.resolve(session(sessionId).capture(width.toInt(), quality.toInt()))
    }

    @ReactMethod
    fun takeNotices(sessionId: String, promise: Promise) = onMain(promise) {
        val session = sessions[sessionId] ?: return@onMain promise.resolve(Arguments.createArray())
        promise.resolve(Arguments.fromList(session.takeNotices()))
    }

    @ReactMethod
    fun addNotice(sessionId: String, text: String, promise: Promise) = onMain(promise) {
        sessions[sessionId]?.notice(text)
        promise.resolve(true)
    }
}

class BrowserUsePackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = listOf(BrowserUseModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = listOf(BrowserUseHostViewManager())
}
