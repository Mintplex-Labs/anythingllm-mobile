package com.anythingllm.assistant.themes

import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Matrix
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.os.Build
import androidx.annotation.RequiresApi

/**
 * One AGSL shader for a theme (Android 13+), with the shared prelude and forgiving uniform setters.
 *
 * Every shader gets [PRELUDE]: the common uniforms, the noise helpers and `backdropLight()`.
 *  - `uRes`: size in px of what the shader draws into, `uDensity`: px per dp in that space
 *  - `uTime`: the theme clock in seconds (speeds up while thinking)
 *  - `uIntensity`: overall opacity 0..1, `uEnergy`: 0..1 liveliness (1 while listening)
 *  - `uBackdrop` / `uBackdropReady`: the screen under the overlay - read through `backdropLight()`
 * Uniforms a shader does not use are compiled out; setting one is then skipped instead of throwing.
 *
 * Constructing it throws IllegalArgumentException if the shader does not compile - AssistantThemes
 * catches that and falls back to the default theme.
 */
@RequiresApi(Build.VERSION_CODES.TIRAMISU)
class ShaderProgram(body: String) {

    companion object {
        val PRELUDE = """
            uniform float2 uRes;
            uniform float uTime;
            uniform float uIntensity;
            uniform float uEnergy;
            uniform float uDensity;
            uniform shader uBackdrop;
            uniform float uBackdropReady;

            float hash(float2 p) {
                p = fract(p * float2(123.34, 456.21));
                p += dot(p, p + 45.32);
                return fract(p.x * p.y);
            }

            // Smooth value noise in 0..1
            float noise(float2 p) {
                float2 i = floor(p);
                float2 f = fract(p);
                float2 u = f * f * (3.0 - 2.0 * f);
                float a = hash(i);
                float b = hash(i + float2(1.0, 0.0));
                float c = hash(i + float2(0.0, 1.0));
                float d = hash(i + float2(1.0, 1.0));
                return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
            }

            // Three octaves, roughly 0..0.9
            float fbm(float2 p) {
                float v = 0.0;
                float a = 0.5;
                for (int i = 0; i < 3; i++) {
                    v += a * noise(p);
                    p = p * 2.03 + float2(1.7, 9.2);
                    a *= 0.5;
                }
                return v;
            }

            // Two octaves - cheaper, for loops and warps. Roughly 0..0.75
            float fbm2(float2 p) {
                return 0.5 * noise(p) + 0.25 * noise(p * 2.03 + float2(1.7, 9.2));
            }

            // How light the screen under the overlay is here, as seen through the dim: 0 dark, 1 light.
            // Always 0 without a screenshot. 0.65 is what AssistantActivity's SCRIM lets through.
            float backdropLight(float2 coord) {
                half4 c = uBackdrop.eval(coord);
                float lum = dot(float3(c.rgb), float3(0.2126, 0.7152, 0.0722)) * 0.65;
                return smoothstep(0.3, 0.48, lum) * uBackdropReady;
            }
        """.trimIndent()
    }

    val shader = RuntimeShader(PRELUDE + "\n" + body)
    private val missing = mutableSetOf<String>()
    private var backdrop: Bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
    private val backdropMatrix = Matrix()

    init {
        // A child shader must always be bound - a blank 1x1 one until the screenshot arrives.
        bindBackdrop(0f, 0f)
    }

    fun float(name: String, vararg values: Float) {
        if (name in missing) return
        try {
            when (values.size) {
                1 -> shader.setFloatUniform(name, values[0])
                2 -> shader.setFloatUniform(name, values[0], values[1])
            }
        } catch (_: IllegalArgumentException) {
            missing.add(name)
        }
    }

    fun child(name: String, child: Shader) {
        if (name in missing) return
        try {
            shader.setInputShader(name, child)
        } catch (_: IllegalArgumentException) {
            missing.add(name)
        }
    }

    /** The screen under the overlay (null: none), stretched over a `width` x `height` px drawing space. */
    fun setBackdrop(bitmap: Bitmap?, width: Float, height: Float) {
        if (bitmap != null) backdrop = bitmap
        float("uBackdropReady", if (bitmap != null) 1f else 0f)
        bindBackdrop(width, height)
    }

    /** Rebind the backdrop for a new drawing size - a child's matrix only applies as of binding. */
    fun bindBackdrop(width: Float, height: Float) {
        val child = BitmapShader(backdrop, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP).apply {
            // Smooth between the few pixels of the thumbnail, so light and dark areas blend at their edges.
            filterMode = BitmapShader.FILTER_MODE_LINEAR
        }
        if (width > 0f && height > 0f) {
            backdropMatrix.setScale(width / backdrop.width, height / backdrop.height)
            child.setLocalMatrix(backdropMatrix)
        }
        child("uBackdrop", child)
    }
}
