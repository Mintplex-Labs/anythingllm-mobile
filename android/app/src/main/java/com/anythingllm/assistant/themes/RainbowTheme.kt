package com.anythingllm.assistant.themes

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin

/**
 * The default, after Circle to Search: large soft blobs in the Google colors, anchored around the edges
 * of the screen, drifting slowly over the dimmed app. Each blob is a radial gradient from its color to
 * transparent, so there is no hard edge and no banding.
 */
class RainbowTheme : AssistantTheme {

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
        /** Seconds for one drift loop at rest. */
        private const val PERIOD_S = 9.0
    }

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { isDither = true }
    private val shaders = arrayOfNulls<RadialGradient>(BLOBS.size)
    private val shaderMatrix = Matrix()
    private var radius = 0f
    private var width = 0f
    private var height = 0f

    override fun onSizeChanged(width: Int, height: Int, density: Float) {
        this.width = width.toFloat()
        this.height = height.toFloat()
        radius = max(1f, width * RADIUS)
        // Built once around the origin and moved with a matrix each frame - no allocations while animating.
        BLOBS.forEachIndexed { i, blob ->
            val mid = Color.argb(110, Color.red(blob.color), Color.green(blob.color), Color.blue(blob.color))
            shaders[i] = RadialGradient(0f, 0f, radius, intArrayOf(blob.color, mid, Color.TRANSPARENT), floatArrayOf(0f, 0.45f, 1f), Shader.TileMode.CLAMP)
        }
    }

    override fun draw(canvas: Canvas, frame: AssistantThemeFrame) {
        if (radius <= 1f) return
        val phase = frame.clock * 2 * Math.PI / PERIOD_S
        paint.alpha = (255 * PEAK_ALPHA * frame.intensity).toInt().coerceIn(0, 255)
        BLOBS.forEachIndexed { i, blob ->
            val shader = shaders[i] ?: return@forEachIndexed
            val cx = blob.x * width + cos(phase + blob.offset).toFloat() * blob.drift * width
            val cy = blob.y * height + sin(phase * 0.8 + blob.offset).toFloat() * blob.drift * width
            shaderMatrix.setTranslate(cx, cy)
            shader.setLocalMatrix(shaderMatrix)
            paint.shader = shader
            canvas.drawCircle(cx, cy, radius, paint)
        }
    }
}
