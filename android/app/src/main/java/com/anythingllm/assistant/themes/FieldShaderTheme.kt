package com.anythingllm.assistant.themes

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.os.Build
import androidx.annotation.RequiresApi
import kotlin.math.ceil

/**
 * A dot-grid theme drawn in two passes, so the expensive noise runs once per dot instead of once per
 * pixel (a dot covers ~50 pixels):
 *
 *  1. The field shader runs on a tiny layer with one texel per grid cell and writes whatever the dots
 *     need (size, height, ...) into the channels. That layer is scaled up by the cell size, so texel
 *     (i, j) lands exactly on cell (i, j) of the screen.
 *  2. The composite shader runs full-screen as a RenderEffect over that scaled layer (`uField`): it
 *     reads its cell's value at the cell center - where the scaled texel is exact - and draws a crisp
 *     dot. Only a handful of texture reads per pixel, no noise.
 *
 * Field shaders get `uRes` = the field size in texels (so `fragCoord` is cell index + 0.5), `uScreen` =
 * the screen size in px and `uDensity`. Composite shaders get `uRes`/`uScreen` = the screen, `uCell` =
 * the cell size in px, `uDensity` and the backdrop. The overall intensity is the composite's layer
 * alpha, so neither pass needs `uIntensity`. Values should be 0..1; 8 bits per channel.
 */
@RequiresApi(Build.VERSION_CODES.TIRAMISU)
abstract class FieldShaderTheme(fieldBody: String, compositeBody: String) : AssistantTheme {

    override val frameIntervalMs = 33L

    /** Width and height (px) of one grid cell - one field texel. */
    protected abstract fun cellSize(density: Float): Pair<Float, Float>

    /** Field rows past the bottom of the screen the composite may read (eg: rows that are lifted up into view). */
    protected open val extraRows = 0

    private val field = ShaderProgram(fieldBody)
    private val composite = ShaderProgram(compositeBody)
    private val fieldPaint = Paint().apply { shader = field.shader }
    private val fieldLayer = RenderNode("AssistantThemeField").apply { setUseCompositingLayer(true, null) }
    private val compositeLayer = RenderNode("AssistantThemeComposite")
    private var width = 0f
    private var height = 0f
    private var columns = 0
    private var rows = 0

    override fun onSizeChanged(width: Int, height: Int, density: Float) {
        this.width = width.toFloat()
        this.height = height.toFloat()
        val (cellWidth, cellHeight) = cellSize(density)
        columns = ceil(width / cellWidth).toInt() + 1
        rows = ceil(height / cellHeight).toInt() + 1 + extraRows

        field.float("uRes", columns.toFloat(), rows.toFloat())
        field.float("uScreen", this.width, this.height)
        field.float("uDensity", density)
        fieldLayer.setPosition(0, 0, columns, rows)
        fieldLayer.pivotX = 0f
        fieldLayer.pivotY = 0f
        fieldLayer.scaleX = cellWidth
        fieldLayer.scaleY = cellHeight

        composite.float("uRes", this.width, this.height)
        composite.float("uScreen", this.width, this.height)
        composite.float("uCell", cellWidth, cellHeight)
        composite.float("uDensity", density)
        composite.bindBackdrop(this.width, this.height)
        // Tall enough for the extra rows, so the composite can read them; the view clips the rest.
        compositeLayer.setPosition(0, 0, width, ceil(rows * cellHeight).toInt())
        applyComposite()
    }

    override fun onBackdrop(backdrop: Bitmap?) {
        composite.setBackdrop(backdrop, width, height)
        applyComposite()
    }

    /** The effect snapshots the composite shader, so it is rebuilt whenever that shader's inputs change. */
    private fun applyComposite() {
        compositeLayer.setRenderEffect(RenderEffect.createRuntimeShaderEffect(composite.shader, "uField"))
    }

    override fun draw(canvas: Canvas, frame: AssistantThemeFrame) {
        // Both passes need hardware rendering, which the overlay window always has.
        if (width <= 0f || !canvas.isHardwareAccelerated) return
        field.float("uTime", frame.clock.toFloat())
        field.float("uEnergy", frame.energy)

        val fieldCanvas = fieldLayer.beginRecording()
        fieldCanvas.drawRect(0f, 0f, columns.toFloat(), rows.toFloat(), fieldPaint)
        fieldLayer.endRecording()

        val compositeCanvas = compositeLayer.beginRecording()
        compositeCanvas.drawRenderNode(fieldLayer)
        compositeLayer.endRecording()
        compositeLayer.alpha = frame.intensity.coerceIn(0f, 1f)
        canvas.drawRenderNode(compositeLayer)
    }
}
