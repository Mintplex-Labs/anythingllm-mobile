package com.anythingllm.assistant

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import android.os.SystemClock
import android.view.View
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * The animated color wash behind the assistant overlay, after Circle to Search: large soft blobs in the
 * Google colors, anchored around the edges of the screen, drifting slowly over the dimmed app. Each
 * blob is a radial gradient from its color to transparent, so there is no hard edge and no banding.
 *
 * It sits below the React root (the overlay card is drawn over it) and never takes touches. States,
 * set from JS through AssistantModule:
 *  - `idle`: the wash at rest, drifting slowly
 *  - `listening`: brighter, breathing
 *  - `thinking`: drifting faster while the model replies
 *  - `hidden`: faded out
 */
class AssistantGlowView(context: Context) : View(context) {

    private data class Style(val intensity: Float, val periodMs: Float, val breathe: Boolean)

    /** Anchor as a fraction of the view, drift radius as a fraction of the width, phase offset. */
    private data class Blob(val color: Int, val x: Float, val y: Float, val drift: Float, val offset: Float)

    companion object {
        private val BLOBS = listOf(
            Blob(Color.parseColor("#4285F4"), 0.0f, 0.05f, 0.10f, 0.0f),
            Blob(Color.parseColor("#EA4335"), 1.0f, 0.12f, 0.10f, 1.3f),
            Blob(Color.parseColor("#FBBC04"), 1.05f, 0.62f, 0.12f, 2.6f),
            Blob(Color.parseColor("#34A853"), 0.35f, 1.02f, 0.14f, 3.9f),
            Blob(Color.parseColor("#4285F4"), -0.05f, 0.58f, 0.10f, 5.2f),
        )
        /** Blob radius as a fraction of the screen width. */
        private const val RADIUS = 0.95f
        /** Peak opacity of a blob's center at full intensity. */
        private const val PEAK_ALPHA = 0.62f
        private val STYLES = mapOf(
            "idle" to Style(0.8f, 9_000f, false),
            "listening" to Style(1f, 6_000f, true),
            "thinking" to Style(0.9f, 2_500f, false),
            "hidden" to Style(0f, 9_000f, false),
        )
        /** Time constant of intensity changes, so states blend instead of snapping. */
        private const val FADE_MS = 300f
        private const val BREATHE_PERIOD_MS = 1_800.0
    }

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { isDither = true }
    private val shaders = arrayOfNulls<RadialGradient>(BLOBS.size)
    private val shaderMatrix = Matrix()
    private var radius = 0f

    private var style = STYLES.getValue("idle")
    private var intensity = 0f
    private var phase = 0.0
    private var lastFrame = 0L

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

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        radius = max(1f, w * RADIUS)
        // Built once around the origin and moved with a matrix each frame - no allocations while animating.
        BLOBS.forEachIndexed { i, blob ->
            val center = Color.argb(255, Color.red(blob.color), Color.green(blob.color), Color.blue(blob.color))
            val mid = Color.argb(110, Color.red(blob.color), Color.green(blob.color), Color.blue(blob.color))
            shaders[i] = RadialGradient(0f, 0f, radius, intArrayOf(center, mid, Color.TRANSPARENT), floatArrayOf(0f, 0.45f, 1f), Shader.TileMode.CLAMP)
        }
    }

    override fun onDraw(canvas: Canvas) {
        val now = SystemClock.uptimeMillis()
        val dt = if (lastFrame == 0L) 16f else (now - lastFrame).toFloat().coerceAtMost(64f)
        lastFrame = now

        intensity += (style.intensity - intensity) * min(1f, dt / FADE_MS)
        phase = (phase + 2 * Math.PI * dt / style.periodMs) % (2 * Math.PI)

        if (intensity > 0.01f && radius > 1f) {
            val breath = if (style.breathe) 0.88f + 0.12f * sin(now / BREATHE_PERIOD_MS * 2 * Math.PI).toFloat() else 1f
            paint.alpha = (255 * PEAK_ALPHA * intensity * breath).toInt().coerceIn(0, 255)
            val w = width.toFloat()
            val h = height.toFloat()
            BLOBS.forEachIndexed { i, blob ->
                val shader = shaders[i] ?: return@forEachIndexed
                val cx = blob.x * w + cos(phase + blob.offset).toFloat() * blob.drift * w
                val cy = blob.y * h + sin(phase * 0.8 + blob.offset).toFloat() * blob.drift * w
                shaderMatrix.setTranslate(cx, cy)
                shader.setLocalMatrix(shaderMatrix)
                paint.shader = shader
                canvas.drawCircle(cx, cy, radius, paint)
            }
        }

        // Keep animating while visible; settle once faded out.
        if (style.intensity > 0f || intensity > 0.01f) postInvalidateOnAnimation()
    }
}
