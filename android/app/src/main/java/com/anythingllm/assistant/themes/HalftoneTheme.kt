package com.anythingllm.assistant.themes

import android.os.Build
import androidx.annotation.RequiresApi

/**
 * Halftone: a fine grid of soft dots over the screen, their size tracing slow, melting blobs - a
 * domain-warped noise field with raised plateaus that catch the light on one side. The shapes flow
 * gently; listening swells the dots a little. The dots are white over dark parts of the screen and
 * dark over light parts (read from the invocation screenshot), so they show on any app.
 *
 * Two passes (FieldShaderTheme): the field computes each dot's size once per cell, the composite draws
 * the dots.
 */
@RequiresApi(Build.VERSION_CODES.TIRAMISU)
class HalftoneTheme : FieldShaderTheme(fieldBody = FIELD, compositeBody = COMPOSITE) {

    override fun cellSize(density: Float): Pair<Float, Float> = (CELL_DP * density).let { it to it }

    private companion object {
        const val CELL_DP = 7f

        /** One texel per cell; r = the dot's size 0..1. */
        val FIELD = """
            uniform float2 uScreen;

            half4 main(float2 fragCoord) {
                // fragCoord is the cell index + 0.5, ie: the cell center in cell units - back to screen px.
                float2 p = fragCoord * (7.0 * uDensity) / (uScreen.x * 0.45);
                float t = uTime * 0.08;
                float2 warp = float2(fbm2(p + float2(0.0, t)), fbm2(p + float2(5.2, 1.3 - t)));
                float2 q = p + 1.8 * warp + float2(t * 0.5, 0.0);
                float h = fbm(q);

                // Blobs with soft plateaus, lit from the top left by the slope of the field.
                float shape = smoothstep(0.36, 0.5, h);
                float slope = fbm(q + float2(-0.03, -0.03)) - h;
                float light = clamp(0.5 - slope * 18.0, 0.0, 1.0);
                float level = mix(0.18, 0.5, shape) + (light - 0.5) * 0.45 * shape;
                level = clamp(level * (1.0 + 0.2 * uEnergy), 0.06, 0.92);
                return half4(half(level), 0.0, 0.0, 1.0);
            }
        """.trimIndent()

        /** Full screen: a crisp dot per cell, sized from the field. */
        val COMPOSITE = """
            uniform float2 uScreen;
            uniform float2 uCell;
            uniform shader uField;

            half4 main(float2 fragCoord) {
                float cell = uCell.x;
                float2 center = (floor(fragCoord / cell) + 0.5) * cell;
                float level = float(uField.eval(center).r);

                float radius = cell * 0.5 * level;
                float d = length(fragCoord - center);
                float dotMask = 1.0 - smoothstep(radius - 0.75, radius + 0.75, d);
                float a = dotMask * (0.14 + 0.32 * level);

                // Ink follows the screen under the dot (sampled at its center, so a dot is one color): white on
                // dark, dark on light - a little stronger there, as dark ink on a light page reads fainter.
                float paper = backdropLight(center);
                a *= mix(1.0, 1.3, paper);
                float ink = 1.0 - paper;
                return half4(half3(ink * a), half(a));
            }
        """.trimIndent()
    }
}
