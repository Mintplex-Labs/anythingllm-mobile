package com.anythingllm.assistant.themes

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RenderNode
import android.os.Build
import androidx.annotation.RequiresApi
import kotlin.math.ceil

/**
 * A theme drawn by one full-screen AGSL shader (see ShaderProgram for the uniforms).
 *
 * Soft themes can set [renderScale] below 1: the shader then runs on a smaller offscreen layer that the
 * GPU scales up with smooth filtering - at 1/3, a ninth of the pixels, with no visible difference for
 * content that has no sharp edges. Inside the shader, `uRes` and `uDensity` describe that smaller space,
 * so the same code works at any scale.
 */
@RequiresApi(Build.VERSION_CODES.TIRAMISU)
abstract class ShaderTheme(body: String, private val renderScale: Float = 1f) : AssistantTheme {

    // Textured themes move slowly - 30 fps looks the same and halves the work on a 60 Hz screen (quarters it at 120 Hz).
    override val frameIntervalMs = 33L

    private val program = ShaderProgram(body)
    private val paint = Paint().apply { shader = program.shader }
    private val layer = RenderNode("AssistantShaderTheme").apply { setUseCompositingLayer(true, null) }
    private val scaled = renderScale < 1f
    private var width = 0f
    private var height = 0f
    private var renderWidth = 0f
    private var renderHeight = 0f

    override fun onSizeChanged(width: Int, height: Int, density: Float) {
        this.width = width.toFloat()
        this.height = height.toFloat()
        val scale = if (scaled) renderScale else 1f
        renderWidth = ceil(width * scale)
        renderHeight = ceil(height * scale)
        program.float("uRes", renderWidth, renderHeight)
        program.float("uDensity", density * scale)
        program.bindBackdrop(renderWidth, renderHeight)
        if (scaled) {
            layer.setPosition(0, 0, renderWidth.toInt(), renderHeight.toInt())
            layer.pivotX = 0f
            layer.pivotY = 0f
            layer.scaleX = this.width / renderWidth
            layer.scaleY = this.height / renderHeight
        }
    }

    override fun onBackdrop(backdrop: Bitmap?) {
        program.setBackdrop(backdrop, renderWidth, renderHeight)
    }

    override fun draw(canvas: Canvas, frame: AssistantThemeFrame) {
        if (width <= 0f) return
        program.float("uTime", frame.clock.toFloat())
        program.float("uIntensity", frame.intensity)
        program.float("uEnergy", frame.energy)

        if (scaled && canvas.isHardwareAccelerated) {
            val recording = layer.beginRecording()
            recording.drawRect(0f, 0f, renderWidth, renderHeight, paint)
            layer.endRecording()
            canvas.drawRenderNode(layer)
        } else {
            // Same picture at full cost (no hardware layer available) - the shader still sees its own space.
            canvas.save()
            canvas.scale(width / renderWidth, height / renderHeight)
            canvas.drawRect(0f, 0f, renderWidth, renderHeight, paint)
            canvas.restore()
        }
    }
}
