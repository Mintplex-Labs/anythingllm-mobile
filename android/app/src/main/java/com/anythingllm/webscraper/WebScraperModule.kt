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
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * WebScraperModule is a React Native module that scrapes a website and returns the content.
 * It uses a WebView to load the website in a hidden context and extract the content (TEXT ONLY)
 */
class WebScraperModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    companion object {
        private const val TAG = "WebScraperModule"
        private const val TIMEOUT_SECONDS = 30L
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

    private fun performScrape(url: String, promise: Promise) {
        val latch = CountDownLatch(1)
        var result: WritableMap = Arguments.createMap().apply {
            putString("title", "")
            putString("content", "")
            putString("url", url)
        }
        var error: Exception? = null

        val webView = WebView(reactApplicationContext)
        
        // Configure WebView settings
        val settings = webView.settings
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

        val webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)

                // Define the JavaScript snippets to execute
                val javascripts = mapOf(
                    "title" to "(function() {return document.title;})()",
                    "content" to "(function() {return document.body.innerText;})()",
                    "url" to "(function() {return window.location.href;})()"
                )

                // Track how many JavaScript evaluations we're waiting for
                val pendingEvaluations = CountDownLatch(javascripts.size)
                var evaluationError: Exception? = null

                for ((key, script) in javascripts) {
                    view?.evaluateJavascript(script) { jsResult ->
                        try {
                            val cleanResult = jsResult?.removeSurrounding("\"")?.replace("\\\"", "\"")
                            Log.d(TAG, "Scrape result for $key: $cleanResult")
                            result.putString(key, cleanResult ?: "")
                        } catch (e: Exception) {
                            Log.e(TAG, "Error processing JavaScript result", e)
                            evaluationError = e
                        } finally {
                            pendingEvaluations.countDown()
                        }
                    }
                }

                // Wait for all JavaScript evaluations to complete
                Thread {
                    try {
                        if (pendingEvaluations.await(10, TimeUnit.SECONDS)) {
                            if (evaluationError != null) {
                                error = evaluationError
                            }
                            latch.countDown()
                        } else {
                            error = Exception("JavaScript evaluation timed out")
                            latch.countDown()
                        }
                    } catch (e: Exception) {
                        error = e
                        latch.countDown()
                    }
                }.start()
            }

            override fun onReceivedError(view: WebView?, errorCode: Int, description: String?, failingUrl: String?) {
                super.onReceivedError(view, errorCode, description, failingUrl)
                Log.e(TAG, "WebView error: $errorCode - $description")
                error = Exception("WebView error: $description")
                latch.countDown()
            }
        }

        webView.webViewClient = webViewClient
        webView.loadUrl(url)
        Thread {
            try {
                if (latch.await(TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                    if (error != null) {
                        promise.reject("SCRAPE_ERROR", error?.message, error)
                    } else {
                        promise.resolve(result)
                    }
                } else {
                    promise.reject("TIMEOUT_ERROR", "Scraping timed out after $TIMEOUT_SECONDS seconds")
                }
            } catch (e: Exception) {
                promise.reject("SCRAPE_ERROR", e.message, e)
            }
        }.start()
    }
}