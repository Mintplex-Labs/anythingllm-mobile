package com.anythingllm.browseruse

import android.graphics.Bitmap
import android.net.Uri
import android.net.http.SslError
import android.os.Message
import android.webkit.GeolocationPermissions
import android.webkit.HttpAuthHandler
import android.webkit.JsPromptResult
import android.webkit.JsResult
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.SslErrorHandler
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * What an agent WebView allows, and how page events reach its BrowserUseSession.
 *
 * Nothing on a page may stall the agent or reach outside the browser: dialogs are answered
 * automatically, and links to other apps, file pickers, permissions, HTTP auth and bad
 * certificates are refused. Each of those leaves a notice the agent reads with the next page state.
 */

internal class AgentWebViewClient(private val session: BrowserUseSession) : WebViewClient() {
    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        val scheme = request.url.scheme?.lowercase()
        if (scheme in WEB_SCHEMES) return false
        if (request.isForMainFrame) session.notice("Blocked a link to \"${request.url.toString().take(80)}\" - only web pages can be opened.")
        return true
    }

    override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) = session.onPageStarted()

    override fun onPageFinished(view: WebView, url: String?) = session.onPageFinished(url)

    override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) = session.onVisited(url)

    override fun onReceivedHttpAuthRequest(view: WebView, handler: HttpAuthHandler, host: String?, realm: String?) {
        handler.cancel()
        session.notice("The site asked for a browser-level username/password, which is not supported.")
    }

    override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
        handler.cancel()
        session.notice("The page's security certificate is not valid, so it was not opened.")
    }

    // Returning true keeps the app alive; the WebView is unusable from here on.
    override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
        session.onRendererGone(detail.didCrash())
        return true
    }

    companion object {
        /** Everything else (intent:, tel:, market:, custom app schemes) would leave the browser */
        private val WEB_SCHEMES = setOf("http", "https", "about", "data", "blob")
    }
}

internal class AgentChromeClient(private val session: BrowserUseSession) : WebChromeClient() {
    override fun onProgressChanged(view: WebView, newProgress: Int) = session.onProgress(newProgress)

    override fun onReceivedTitle(view: WebView, title: String?) = session.onStatusChanged()

    override fun onJsAlert(view: WebView, url: String?, message: String?, result: JsResult): Boolean {
        session.notice("The page showed an alert: \"${clip(message)}\"")
        result.confirm()
        return true
    }

    override fun onJsConfirm(view: WebView, url: String?, message: String?, result: JsResult): Boolean {
        session.notice("The page asked \"${clip(message)}\" and it was automatically confirmed.")
        result.confirm()
        return true
    }

    override fun onJsPrompt(view: WebView, url: String?, message: String?, defaultValue: String?, result: JsPromptResult): Boolean {
        session.notice("The page prompted \"${clip(message)}\" and it was dismissed.")
        result.cancel()
        return true
    }

    override fun onJsBeforeUnload(view: WebView, url: String?, message: String?, result: JsResult): Boolean {
        result.confirm()
        return true
    }

    override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
        session.notice("The page opened a file upload picker. Uploading files is not supported, so it was ignored.")
        callback.onReceiveValue(null)
        return true
    }

    override fun onPermissionRequest(request: PermissionRequest) = request.deny()

    override fun onGeolocationPermissionsShowPrompt(origin: String?, callback: GeolocationPermissions.Callback) = callback.invoke(origin, false, false)

    // Popups are off (setSupportMultipleWindows(false)) - target=_blank links load in the same tab.
    override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message?): Boolean = false

    private fun clip(text: String?, max: Int = 300): String {
        val flat = (text ?: "").replace(Regex("\\s+"), " ").trim()
        return if (flat.length > max) flat.take(max - 1) + "…" else flat
    }
}
