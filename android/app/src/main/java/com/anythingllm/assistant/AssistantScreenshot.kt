package com.anythingllm.assistant

import android.content.Context
import android.graphics.Bitmap
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.io.File
import java.io.FileOutputStream

/**
 * Hands the screenshot of the app under the assistant from the session to the overlay.
 *
 * The system captures the screen as the assist gesture fires - before our overlay is drawn - and
 * delivers it to the session some time after onShow, by which point the overlay is usually already
 * starting. So the session saves it to a file here and the overlay asks for it (`await`), getting it
 * as soon as it lands. Only the latest invocation counts: a late delivery for an earlier one is dropped.
 *
 * No screenshot arrives when the user has turned off "Use screenshot" in the assistant settings (the
 * system then leaves SHOW_WITH_SCREENSHOT out of the show flags), and a null one arrives when the app
 * on screen blocks capture (FLAG_SECURE: banking apps, incognito tabs, DRM video).
 */
object AssistantScreenshot {

    private const val TAG = "AssistantScreenshot"
    private const val DIR = "assistant"
    private const val JPEG_QUALITY = 90
    /** How long to wait for a screenshot the system said it would send. */
    private const val EXPECTED_TIMEOUT_MS = 4_000L
    /** The show flags are not reliable on every build - still wait briefly when none was announced. */
    private const val UNANNOUNCED_TIMEOUT_MS = 1_500L

    const val REASON_DISABLED = "disabled"
    const val REASON_BLOCKED = "blocked"
    const val REASON_TIMEOUT = "timeout"
    const val REASON_NONE = "none"

    /** `path` is set when a screenshot is ready, `reason` says why not otherwise. */
    data class Result(val path: String?, val reason: String?)

    private val lock = Any()
    private val main = Handler(Looper.getMainLooper())
    private var invocation = 0L
    private var requested = false
    private var result: Result? = Result(null, REASON_NONE)
    private val waiters = mutableListOf<(Result) -> Unit>()

    /** Start a new invocation; returns its id for `deliver`. */
    fun begin(context: Context, screenshotRequested: Boolean): Long {
        val id: Long
        val stale: List<(Result) -> Unit>
        synchronized(lock) {
            id = ++invocation
            requested = screenshotRequested
            result = null
            stale = waiters.toList()
            waiters.clear()
        }
        stale.forEach { it(Result(null, REASON_NONE)) }
        Thread { clearFiles(context, keep = id) }.start()

        val timeout = if (screenshotRequested) EXPECTED_TIMEOUT_MS else UNANNOUNCED_TIMEOUT_MS
        main.postDelayed({ settle(id, Result(null, if (screenshotRequested) REASON_TIMEOUT else REASON_DISABLED)) }, timeout)
        return id
    }

    /** The system's screenshot for invocation `id`; saved off the main thread. */
    fun deliver(context: Context, id: Long, bitmap: Bitmap?) {
        if (bitmap == null) {
            settle(id, Result(null, REASON_BLOCKED))
            return
        }
        Thread {
            val path = try {
                save(context, id, bitmap)
            } catch (e: Exception) {
                Log.e(TAG, "Could not save the screenshot", e)
                null
            }
            settle(id, if (path != null) Result(path, null) else Result(null, REASON_BLOCKED))
        }.start()
    }

    /** Calls back with the current invocation's screenshot once it is known (right away if it already is). */
    fun await(callback: (Result) -> Unit) {
        val ready = synchronized(lock) {
            result ?: run { waiters.add(callback); null }
        }
        if (ready != null) callback(ready)
    }

    private fun settle(id: Long, value: Result) {
        val toNotify: List<(Result) -> Unit>
        synchronized(lock) {
            // A later invocation took over, or this one is already settled (eg: delivered before the timeout).
            if (id != invocation || result != null) return
            result = value
            toNotify = waiters.toList()
            waiters.clear()
        }
        toNotify.forEach { it(value) }
    }

    private fun save(context: Context, id: Long, bitmap: Bitmap): String {
        // Hardware bitmaps cannot be read back for compression on every version - copy to a software one.
        val source = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && bitmap.config == Bitmap.Config.HARDWARE) {
            bitmap.copy(Bitmap.Config.ARGB_8888, false)
        } else bitmap
        val dir = File(context.cacheDir, DIR).apply { mkdirs() }
        // Unique per invocation so image caches never show a previous screen.
        val file = File(dir, "screen-$id-${System.currentTimeMillis()}.jpg")
        FileOutputStream(file).use { source.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, it) }
        if (source !== bitmap) source.recycle()
        return file.absolutePath
    }

    /** Drop the screenshots of earlier invocations (never the current one, which may already be saved). */
    private fun clearFiles(context: Context, keep: Long) {
        try {
            File(context.cacheDir, DIR).listFiles()?.filterNot { it.name.startsWith("screen-$keep-") }?.forEach { it.delete() }
        } catch (e: Exception) {
            Log.w(TAG, "Could not clear old screenshots", e)
        }
    }
}
