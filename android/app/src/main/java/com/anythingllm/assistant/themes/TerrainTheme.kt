package com.anythingllm.assistant.themes

import android.os.Build
import androidx.annotation.RequiresApi

/**
 * Terrain: rows of dots lifted into rolling hills by a noise height map, peaks brighter and their dots
 * larger, like a point-cloud landscape. The hills drift slowly; listening raises them. Fainter towards
 * the top so what is on screen there stays readable. Like Halftone, the dots turn dark over light parts
 * of the screen.
 *
 * Two passes (FieldShaderTheme): the field computes each dot's height once per dot, the composite
 * places the dots - a dot is drawn above its resting row by its lift, so each pixel checks the few rows
 * at and below it that could reach it.
 */
@RequiresApi(Build.VERSION_CODES.TIRAMISU)
class TerrainTheme : FieldShaderTheme(fieldBody = FIELD, compositeBody = COMPOSITE) {

    override fun cellSize(density: Float): Pair<Float, Float> = GAP_DP * density to ROW_GAP_DP * density

    /** Rows below the screen whose hills can rise into view: the tallest lift (70 dp) over the row gap. */
    override val extraRows = ROWS_CHECKED

    private companion object {
        const val GAP_DP = 6f
        const val ROW_GAP_DP = 9f
        const val ROWS_CHECKED = 9

        /**
         * One texel per dot (x = column, y = row). r = height 0..1 (brightness and size); the lift - how
         * far the dot rises, as a fraction of the 70 dp maximum - is split across g (coarse) and b (fine)
         * so it moves smoothly: 8 bits alone would make dots step by a pixel as the hills drift.
         */
        val FIELD = """
            uniform float2 uScreen;

            half4 main(float2 fragCoord) {
                float gap = 6.0 * uDensity;
                float rowGap = 9.0 * uDensity;
                float t = uTime * 0.1;
                float cx = fragCoord.x * gap;               // column center, screen px
                float rowY = (fragCoord.y - 0.5) * rowGap;  // row index in screen px
                float h = fbm2(float2(cx, rowY) / (uScreen.x * 0.4) + float2(t, t * 0.35)) / 0.75;
                h = clamp(h * h, 0.0, 1.0);
                float lift = h * (48.0 + 22.0 * uEnergy) / 70.0;
                float coarse = floor(lift * 255.0) / 255.0;
                float fine = fract(lift * 255.0);
                return half4(half(h), half(coarse), half(fine), 1.0);
            }
        """.trimIndent()

        val COMPOSITE = """
            uniform float2 uScreen;
            uniform float2 uCell;
            uniform shader uField;

            half4 main(float2 fragCoord) {
                float gap = uCell.x;
                float rowGap = uCell.y;
                float maxLift = 70.0 * uDensity;
                float cx = (floor(fragCoord.x / gap) + 0.5) * gap;
                float firstRow = floor(fragCoord.y / rowGap);
                float best = 0.0;
                for (int k = 0; k < $ROWS_CHECKED; k++) {
                    float row = firstRow + float(k);
                    half4 v = uField.eval(float2(cx, (row + 0.5) * rowGap));
                    float h = float(v.r);
                    float lift = float(v.g) + float(v.b) / 255.0;
                    float y = (row + 0.5) * rowGap - lift * maxLift;
                    float r = (0.55 + 1.35 * h) * uDensity;
                    float d = length(fragCoord - float2(cx, y));
                    float m = 1.0 - smoothstep(r - 0.7, r + 0.7, d);
                    best = max(best, m * (0.2 + 0.8 * h));
                }

                float fade = mix(0.45, 1.0, fragCoord.y / uScreen.y);
                float a = best * 0.5 * fade;
                float paper = backdropLight(fragCoord);
                a *= mix(1.0, 1.3, paper);
                float ink = 1.0 - paper;
                return half4(half3(ink * a), half(a));
            }
        """.trimIndent()
    }
}
