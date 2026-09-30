package com.anythingllm.assistant.themes

import android.os.Build
import androidx.annotation.RequiresApi

/**
 * Painterly: a thin wash of oil paint in slate, white and a touch of blue. Soft patches of lighter and
 * darker paint flow through a slowly shifting warp, with brush-stroke streaks laid diagonally along it.
 * The paint moves very slowly; listening brings it forward a little.
 *
 * Built on gradient noise (`gnoise`/`gfbm`) rather than the prelude's value noise: value noise leaves
 * faint creases along its square lattice, which this theme's contrast would turn into visible blocks.
 *
 * It has no sharp edges, so it renders at a third of the resolution and is scaled up smoothly - a
 * ninth of the pixels for the heaviest shader, with no visible difference.
 */
@RequiresApi(Build.VERSION_CODES.TIRAMISU)
class PainterlyTheme : ShaderTheme(
    renderScale = 1f / 3f,
    body = """
    float2 hash2(float2 p) {
        float3 p3 = fract(float3(p.xyx) * float3(0.1031, 0.1030, 0.0973));
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.xx + p3.yz) * p3.zy) * 2.0 - 1.0;
    }

    // Gradient noise, roughly -1..1. The quintic fade keeps it smooth across cell edges - no creases.
    float gnoise(float2 p) {
        float2 i = floor(p);
        float2 f = fract(p);
        float2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
        float a = dot(hash2(i), f);
        float b = dot(hash2(i + float2(1.0, 0.0)), f - float2(1.0, 0.0));
        float c = dot(hash2(i + float2(0.0, 1.0)), f - float2(0.0, 1.0));
        float d = dot(hash2(i + float2(1.0, 1.0)), f - float2(1.0, 1.0));
        return 1.4 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }

    // Four octaves, each rotated so no lattice direction lines up. Roughly -1..1
    float gfbm(float2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
            v += a * gnoise(p);
            p = float2(1.6 * p.x - 1.2 * p.y, 1.2 * p.x + 1.6 * p.y) + float2(3.1, 1.7);
            a *= 0.5;
        }
        return v;
    }

    half4 main(float2 fragCoord) {
        float2 p = fragCoord / (uRes.x * 0.55);
        float t = uTime * 0.04;

        // A slowly shifting warp bends everything below, so strokes and patches curve and flow.
        float2 w = float2(gfbm(p * 0.8 + float2(t, 1.3)), gfbm(p * 0.8 + float2(5.2, 2.8 - t)));
        float2 q = p + 0.6 * w;

        // Brush streaks: noise stretched along a diagonal, in the warped space so they follow its curves
        // at an even density across the screen.
        float2 r = float2(0.825 * q.x - 0.565 * q.y, 0.565 * q.x + 0.825 * q.y);
        float streak = 0.5 + 0.5 * gnoise(float2(r.x * 1.5, r.y * 18.0) + float2(t * 2.0, 0.0));
        float body = 0.5 + 0.5 * gfbm(q * 1.8 + float2(0.0, t));
        float paint = body * 0.75 + streak * 0.25;

        float3 slate = float3(0.36, 0.47, 0.55);
        float3 blue = float3(0.17, 0.42, 0.80);
        float3 white = float3(0.94, 0.96, 0.98);
        float3 col = mix(slate, white, smoothstep(0.3, 0.8, paint));
        col = mix(col, blue, smoothstep(0.6, 0.85, streak) * smoothstep(0.35, 0.6, body) * 0.4);

        float a = (0.2 + 0.14 * smoothstep(0.3, 0.8, paint)) * (1.0 + 0.2 * uEnergy) * uIntensity;
        return half4(half3(col * a), half(a));
    }
    """.trimIndent()
)
