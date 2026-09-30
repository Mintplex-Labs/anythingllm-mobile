package com.anythingllm.assistant

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.os.SystemClock
import android.util.Log
import android.view.View
import com.anythingllm.assistant.themes.AssistantTheme
import com.anythingllm.assistant.themes.AssistantThemeFrame
import com.anythingllm.assistant.themes.AssistantThemes
import kotlin.math.min
import kotlin.math.sin

/**
 * The animated background behind the assistant overlay. What it looks like is up to the theme the
 * user picked (see themes/ - Rainbow by default); this view runs the clock and turns the assistant's
 * state into the frame each theme draws from, so every theme reacts to it the same way.
 *
 * It sits below the React root (the overlay card is drawn over it) and never takes touches. States,
 * set from JS through AssistantModule:
 *  - `idle`: at rest
 *  - `listening`: full strength, breathing, livelier
 *  - `thinking`: moving faster while the model replies
 *  - `hidden`: faded out
 */
class AssistantGlowView(context: Context) : View(context) {

    /** `speed` scales the theme clock; `energy` is the liveliness themes respond to. */
    private data class Style(val intensity: Float, val speed: Float, val breathe: Boolean, val energy: Float)

    companion object {
        private val STYLES = mapOf(
            "idle" to Style(0.8f, 1f, false, 0f),
            "listening" to Style(1f, 1.5f, true, 1f),
            "thinking" to Style(0.9f, 3.6f, false, 0.4f),
            "hidden" to Style(0f, 1f, false, 0f),
        )
        /** Time constant of intensity and energy changes, so states blend instead of snapping. */
        private const val FADE_MS = 300f
        private const val BREATHE_PERIOD_MS = 1_800.0
        /** Width the backdrop thumbnail is decoded down to - enough to tell light areas from dark ones. */
        private const val BACKDROP_WIDTH = 64
        private const val TAG = "AssistantGlowView"
    }

    private var theme: AssistantTheme = AssistantThemes.create(AssistantThemes.stored(context))
    private val frame = AssistantThemeFrame()
    private val density = resources.displayMetrics.density

    private var style = STYLES.getValue("idle")
    private var intensity = 0f
    private var energy = 0f
    private var speed = 1f
    private var lastFrame = 0L
    /** Thumbnail of the invocation screenshot, for themes that adapt to the screen under them. */
    private var backdrop: Bitmap? = null

    init {
        isClickable = false
        isFocusable = false
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
    }

    fun setState(state: String) {
        style = STYLES[state] ?: return
        lastFrame = 0L
        postInvalidateOnAnimation()
    }

    /** Switch theme on the fly (an unknown id shows the default). */
    fun setTheme(id: String?) {
        theme = AssistantThemes.create(id)
        if (width > 0 && height > 0) theme.onSizeChanged(width, height, density)
        backdrop?.let(theme::onBackdrop)
        postInvalidateOnAnimation()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        // The screenshot of the app underneath lands shortly after the overlay opens (if screenshots are on).
        AssistantScreenshot.await { result ->
            val path = result.path ?: return@await
            Thread {
                val thumbnail = decodeThumbnail(path) ?: return@Thread
                post {
                    if (!isAttachedToWindow) return@post
                    backdrop = thumbnail
                    theme.onBackdrop(thumbnail)
                }
            }.start()
        }
    }

    private fun decodeThumbnail(path: String): Bitmap? = try {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(path, bounds)
        var sample = 1
        while (bounds.outWidth / (sample * 2) >= BACKDROP_WIDTH) sample *= 2
        BitmapFactory.decodeFile(path, BitmapFactory.Options().apply {
            inSampleSize = sample
            inPreferredConfig = Bitmap.Config.ARGB_8888
        })
    } catch (e: Exception) {
        Log.w(TAG, "Could not read the screenshot for the backdrop", e)
        null
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        theme.onSizeChanged(w, h, density)
    }

    override fun onDraw(canvas: Canvas) {
        val now = SystemClock.uptimeMillis()
        val dt = if (lastFrame == 0L) 16f else (now - lastFrame).toFloat().coerceAtMost(64f)
        lastFrame = now

        val blend = min(1f, dt / FADE_MS)
        intensity += (style.intensity - intensity) * blend
        energy += (style.energy - energy) * blend
        // Speed eases too, so a theme speeds up and slows down instead of jumping ahead.
        speed += (style.speed - speed) * blend

        frame.clock += dt / 1000.0 * speed
        val breath = if (style.breathe) 0.88f + 0.12f * sin(now / BREATHE_PERIOD_MS * 2 * Math.PI).toFloat() else 1f
        frame.intensity = intensity * breath
        frame.energy = energy

        if (intensity > 0.01f) theme.draw(canvas, frame)

        // Keep animating while visible, at the theme's frame rate; settle once faded out. The few ms off
        // the interval leave room for the next vsync, so eg: 33 ms lands on every 2nd frame at 60 Hz.
        if (style.intensity > 0f || intensity > 0.01f) postInvalidateDelayed((theme.frameIntervalMs - 4L).coerceAtLeast(0L))
    }
}
