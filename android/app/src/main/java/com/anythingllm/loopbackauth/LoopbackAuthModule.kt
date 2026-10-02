package com.anythingllm.loopbackauth

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import androidx.browser.customtabs.CustomTabsIntent
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.BufferedReader
import java.io.IOException
import java.io.InputStreamReader
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.security.MessageDigest
import kotlin.concurrent.thread

/**
 * OAuth sign-in for providers that only accept an HTTP loopback redirect (`http://127.0.0.1:{port}/...`),
 * eg: Sign in with ChatGPT. Custom URL schemes are not an option there, so for the length of one sign-in we:
 *  1. listen on 127.0.0.1 with an OS-assigned port and put that port into the authorize URL (`__LOOPBACK_PORT__`)
 *  2. open the authorize URL in a Custom Tab
 *  3. resolve with the full callback URL as soon as the browser hits `callbackPath`, and answer it with a page
 *     that links back into the app (Android 15+ blocks us from bringing the app forward ourselves)
 * Closing the Custom Tab before the callback arrives rejects with `cancelled`.
 * The OAuth logic itself (PKCE, state, token exchange) stays in JS - see src/utils/chatgpt/auth.ts.
 */
class LoopbackAuthModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

    private class Session(val server: ServerSocket, val promise: Promise) {
        @Volatile var settled = false
        /** The Custom Tab is up and our activity was paused behind it. */
        @Volatile var leftApp = false
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    @Volatile private var session: Session? = null

    init {
        reactContext.addLifecycleEventListener(this)
    }

    override fun getName(): String = "LoopbackAuthModule"

    @ReactMethod
    fun sha256Base64Url(input: String, promise: Promise) {
        val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
        promise.resolve(Base64.encodeToString(digest, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP))
    }

    @ReactMethod
    fun authorize(url: String, callbackPath: String, timeoutMs: Double, promise: Promise) {
        session?.let { finish(it, null, "cancelled", "Superseded by a new sign in.") }

        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("no_activity", "The app is not in the foreground.")
            return
        }

        val server = try {
            ServerSocket(0, 4, InetAddress.getByName("127.0.0.1"))
        } catch (e: IOException) {
            promise.reject("listen_failed", "Could not start the sign in listener.", e)
            return
        }

        val current = Session(server, promise)
        session = current
        val port = server.localPort
        thread(name = "LoopbackAuth", isDaemon = true) { serve(current, port, callbackPath) }
        mainHandler.postDelayed({ finish(current, null, "timeout", "Sign in timed out.") }, timeoutMs.toLong())

        val authUrl = url.replace(PORT_PLACEHOLDER, port.toString())
        activity.runOnUiThread {
            try {
                CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(activity, Uri.parse(authUrl))
            } catch (e: ActivityNotFoundException) {
                finish(current, null, "no_browser", "No browser is available to sign in.")
            }
        }
    }

    @ReactMethod
    fun cancel() {
        session?.let { finish(it, null, "cancelled", "Sign in was cancelled.") }
    }

    /** Accepts connections until the callback arrives. Anything else (eg: /favicon.ico) gets a 404. */
    private fun serve(current: Session, port: Int, callbackPath: String) {
        while (!current.settled) {
            val socket: Socket = try {
                current.server.accept()
            } catch (e: IOException) {
                return // closed by finish()
            }
            try {
                socket.soTimeout = 5_000
                val target = readRequestTarget(socket)
                val path = target?.substringBefore('?')
                if (target != null && path == callbackPath) {
                    val failed = Uri.parse("http://127.0.0.1$target").getQueryParameter("error") != null
                    writeResponse(socket, "200 OK", "text/html; charset=utf-8", callbackPage(failed))
                    finish(current, "http://127.0.0.1:$port$target", null, null)
                    bringAppForward()
                    return
                }
                writeResponse(socket, "404 Not Found", "text/plain; charset=utf-8", "Not found")
            } catch (e: IOException) {
                Log.w(TAG, "Loopback request failed", e)
            } finally {
                try { socket.close() } catch (_: IOException) {}
            }
        }
    }

    /** `GET /callback?code=... HTTP/1.1` -> `/callback?code=...` */
    private fun readRequestTarget(socket: Socket): String? {
        val reader = BufferedReader(InputStreamReader(socket.getInputStream(), Charsets.US_ASCII))
        val requestLine = reader.readLine() ?: return null
        // Drain the headers so the browser does not see the connection reset mid-request.
        while (true) {
            val line = reader.readLine() ?: break
            if (line.isEmpty()) break
        }
        val parts = requestLine.split(' ')
        if (parts.size < 2 || parts[0] != "GET") return null
        return parts[1]
    }

    private fun writeResponse(socket: Socket, status: String, contentType: String, body: String) {
        val bytes = body.toByteArray(Charsets.UTF_8)
        val head = "HTTP/1.1 $status\r\n" +
            "Content-Type: $contentType\r\n" +
            "Content-Length: ${bytes.size}\r\n" +
            "Cache-Control: no-store\r\n" +
            "Connection: close\r\n\r\n"
        val out = socket.getOutputStream()
        out.write(head.toByteArray(Charsets.US_ASCII))
        out.write(bytes)
        out.flush()
    }

    /**
     * Best effort - closes the Custom Tab by bringing our singleTask activity back to the top. Android 15+
     * blocks this background activity start, which is why the callback page also links back into the app.
     */
    private fun bringAppForward() {
        val activity = reactContext.currentActivity ?: return
        mainHandler.post {
            try {
                activity.startActivity(
                    Intent(activity, activity.javaClass)
                        .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                )
            } catch (e: Exception) {
                Log.w(TAG, "Could not bring the app forward after sign in", e)
            }
        }
    }

    private fun finish(current: Session, callbackUrl: String?, code: String?, message: String?) {
        synchronized(current) {
            if (current.settled) return
            current.settled = true
        }
        if (session === current) session = null
        try { current.server.close() } catch (_: IOException) {}
        if (callbackUrl != null) current.promise.resolve(callbackUrl)
        else current.promise.reject(code ?: "error", message ?: "Sign in failed.")
    }

    override fun onHostPause() {
        session?.leftApp = true
    }

    /**
     * Back in the app while still waiting - the user closed the Custom Tab. The grace period lets a
     * callback that raced the close (or our own bringAppForward) settle the flow first.
     */
    override fun onHostResume() {
        val current = session ?: return
        if (!current.leftApp) return
        mainHandler.postDelayed({ finish(current, null, "cancelled", "Sign in was cancelled.") }, CANCEL_GRACE_MS)
    }

    override fun onHostDestroy() {
        cancel()
    }

    override fun invalidate() {
        cancel()
        reactContext.removeLifecycleEventListener(this)
        super.invalidate()
    }

    companion object {
        private const val TAG = "LoopbackAuth"
        private const val PORT_PLACEHOLDER = "__LOOPBACK_PORT__"
        private const val CANCEL_GRACE_MS = 1_500L
        private const val RETURN_URL = "anythingllm://sign-in-complete"

        private fun callbackPage(failed: Boolean): String {
            val title = if (failed) "Sign in was not completed" else "You're signed in"
            val detail = if (failed) "You can close this page and try again in AnythingLLM." else "You can return to AnythingLLM."
            return """
                <!doctype html>
                <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
                <title>AnythingLLM</title>
                <style>
                  body { font-family: -apple-system, system-ui, sans-serif; background: #0e0f0f; color: #fff; display: flex;
                         min-height: 100vh; margin: 0; align-items: center; justify-content: center; text-align: center; }
                  main { padding: 24px; } p { color: #9f9fa0; }
                  a { display: inline-block; margin-top: 16px; padding: 12px 20px; border-radius: 8px; background: #fff;
                      color: #0e0f0f; font-weight: 600; text-decoration: none; }
                </style></head>
                <body><main><h2>$title</h2><p>$detail</p><a href="$RETURN_URL">Return to AnythingLLM</a></main>
                <script>setTimeout(function () { location.href = "$RETURN_URL"; }, 300);</script>
                </body></html>
            """.trimIndent()
        }
    }
}
