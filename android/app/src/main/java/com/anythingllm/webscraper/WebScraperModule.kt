package com.anythingllm.webscraper

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments
import android.util.Log
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebSettings
import android.os.Handler
import android.os.Looper
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * WebScraperModule is a React Native module that scrapes a website and returns the content.
 * It uses a WebView to load the website in a hidden context and extract the content (TEXT ONLY)
 */
class WebScraperModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    companion object {
        private const val TAG = "WebScraperModule"
        private const val TIMEOUT_SECONDS = 30L
        /** Quiet time after the last onPageFinished before the DOM is read - lets client-rendered pages settle */
        private const val SETTLE_DELAY_MS = 800L
    }

    override fun getName(): String = "WebScraperModule"

    @ReactMethod
    fun scrape(url: String, promise: Promise) {
        try {
            Log.d(TAG, "Starting scrape for URL: $url")
            Handler(Looper.getMainLooper()).post {
                performScrape(url, promise)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in scrape method", e)
            promise.reject("SCRAPE_ERROR", e.message, e)
        }
    }

    /**
     * Everything here runs on the main looper: WebView callbacks, evaluateJavascript results and the
     * timers. `settled` guarantees the promise is resolved or rejected exactly once and that nothing
     * touches the result map afterwards (a WritableMap is consumed by `resolve` and throws
     * ObjectAlreadyConsumedException on any later write).
     *
     * `onPageFinished` fires more than once for many pages - redirects, iframes and especially
     * client-rendered apps that route after their first paint. Instead of reading the DOM on the
     * first event (often a near-empty shell) the read is debounced: it happens `SETTLE_DELAY_MS`
     * after the *last* page-finished event, so the text reflects the page the user would see.
     */
    private fun performScrape(url: String, promise: Promise) {
        val mainHandler = Handler(Looper.getMainLooper())
        val settled = AtomicBoolean(false)
        var webView: WebView? = WebView(reactApplicationContext)

        fun teardown() {
            val view = webView ?: return
            webView = null
            try {
                view.stopLoading()
                view.webViewClient = WebViewClient()
                view.loadUrl("about:blank")
                view.destroy()
            } catch (e: Exception) {
                Log.w(TAG, "WebView teardown failed", e)
            }
        }

        fun resolveOnce(result: WritableMap) {
            if (!settled.compareAndSet(false, true)) return
            mainHandler.removeCallbacksAndMessages(null)
            teardown()
            promise.resolve(result)
        }

        fun rejectOnce(code: String, message: String, cause: Throwable? = null) {
            if (!settled.compareAndSet(false, true)) return
            mainHandler.removeCallbacksAndMessages(null)
            teardown()
            if (cause != null) promise.reject(code, message, cause) else promise.reject(code, message)
        }

        // Reads title / body text / final url from the loaded page and resolves with them.
        val extract = Runnable {
            val view = webView
            if (settled.get() || view == null) return@Runnable
            val javascripts = linkedMapOf(
                "title" to "(function() {return document.title;})()",
                "content" to "(function() {return document.body ? document.body.innerText : '';})()",
                "url" to "(function() {return window.location.href;})()"
            )
            val collected = HashMap<String, String>()
            var pending = javascripts.size
            for ((key, script) in javascripts) {
                view.evaluateJavascript(script) { jsResult ->
                    if (settled.get()) return@evaluateJavascript
                    val cleanResult = jsResult
                        ?.takeIf { it != "null" }
                        ?.removeSurrounding("\"")
                        ?.replace("\\\"", "\"")
                        ?: ""
                    collected[key] = cleanResult
                    Log.d(TAG, "Scrape result for $key: ${cleanResult.take(200)}")
                    pending -= 1
                    if (pending == 0) {
                        val result = Arguments.createMap().apply {
                            putString("title", collected["title"] ?: "")
                            putString("content", collected["content"] ?: "")
                            putString("url", collected["url"]?.takeIf { it.isNotEmpty() } ?: url)
                        }
                        resolveOnce(result)
                    }
                }
            }
        }

        val view = webView!!
        val settings = view.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.loadWithOverviewMode = true
        settings.useWideViewPort = true
        settings.setSupportZoom(false)
        settings.builtInZoomControls = false
        settings.displayZoomControls = false
        settings.loadsImagesAutomatically = false // Disable images for faster loading
        settings.blockNetworkImage = true
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        settings.allowFileAccessFromFileURLs = false
        settings.allowUniversalAccessFromFileURLs = false

        view.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, finishedUrl: String?) {
                super.onPageFinished(view, finishedUrl)
                if (settled.get()) return
                // Restart the settle timer - the DOM is read once the page stops (re)loading.
                mainHandler.removeCallbacks(extract)
                mainHandler.postDelayed(extract, SETTLE_DELAY_MS)
            }

            override fun onReceivedError(view: WebView?, errorCode: Int, description: String?, failingUrl: String?) {
                super.onReceivedError(view, errorCode, description, failingUrl)
                // Sub-resource failures (a blocked tracker, a missing font) also land here - only the
                // main document failing is fatal to the scrape.
                if (failingUrl != null && failingUrl != url && failingUrl != view?.url) return
                Log.e(TAG, "WebView error: $errorCode - $description")
                rejectOnce("SCRAPE_ERROR", "WebView error: $description")
            }
        }

        mainHandler.postDelayed({
            rejectOnce("TIMEOUT_ERROR", "Scraping timed out after $TIMEOUT_SECONDS seconds")
        }, TimeUnit.SECONDS.toMillis(TIMEOUT_SECONDS))
        view.loadUrl(url)
    }
}
