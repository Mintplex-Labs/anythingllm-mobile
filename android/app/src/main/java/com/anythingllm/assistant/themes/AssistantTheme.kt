package com.anythingllm.assistant.themes

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Build
import android.util.Log

/**
 * One look for the animated background behind the assistant overlay (see AssistantGlowView). A theme
 * only draws: the view owns the clock, the fade in/out and the assistant state, and hands each frame
 * over as an [AssistantThemeFrame]. Themes are self-contained - add one by implementing this and
 * registering it in [AssistantThemes].
 *
 * Draw with the frame's intensity as an overall opacity so state changes fade every theme the same way,
 * and allocate in [onSizeChanged] rather than per frame - it runs 30 times a second.
 */
interface AssistantTheme {
    /**
     * Minimum time between frames: 30 fps for every theme. The motion is slow on purpose, so none needs
     * the display's full refresh rate (up to 120 Hz) - capping it is most of the battery and heat saving.
     */
    val frameIntervalMs: Long get() = 33L

    /** The view's size (px) and display density; build size-dependent shaders and caches here. */
    fun onSizeChanged(width: Int, height: Int, density: Float)

    fun draw(canvas: Canvas, frame: AssistantThemeFrame)

    /**
     * A small, low-resolution copy of the screen under the overlay (the invocation screenshot), for
     * themes that adapt to it - eg: dark dots over light screens. Null when there is no screenshot
     * (turned off in the assistant settings, or the app blocks capture). Arrives after the theme is
     * created, if at all.
     */
    fun onBackdrop(backdrop: Bitmap?) {}
}

/** Per-frame input, reused between frames. */
class AssistantThemeFrame {
    /** Animation time in seconds; runs faster while the model is thinking, so motion speeds up smoothly. */
    var clock = 0.0
    /** Overall opacity in 0..1: the state's strength, the fade in/out and the listening "breath". */
    var intensity = 0f
    /** 0..1, smoothed: how lively to be - 1 while listening, a little while thinking, 0 at rest. */
    var energy = 0f
}

/**
 * The registry of themes and the stored choice. The choice lives in native preferences (not JS
 * storage) so the overlay can start drawing the right theme before JS has loaded. Anything unknown or
 * unusable falls back to Rainbow: a missing preference, a theme removed in an update, a bad value from
 * JS, a shader theme on a device older than Android 13, or a shader that fails to compile.
 */
object AssistantThemes {
    const val RAINBOW = "rainbow"
    const val HALFTONE = "halftone"
    const val TERRAIN = "terrain"
    const val PAINTERLY = "painterly"
    const val DEFAULT = RAINBOW
    val IDS = listOf(RAINBOW, HALFTONE, TERRAIN, PAINTERLY)
    /** Drawn with AGSL shaders (ShaderTheme), which need Android 13. */
    private val SHADER_THEMES = setOf(HALFTONE, TERRAIN, PAINTERLY)

    private const val TAG = "AssistantThemes"
    private const val PREFS = "assistant"
    private const val KEY_THEME = "theme"
    private const val KEY_ANIMATED = "animated"

    fun isSupported(id: String): Boolean =
        id in IDS && (id !in SHADER_THEMES || Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)

    /** The themes this device can draw, in picker order. */
    fun available(): List<String> = IDS.filter(::isSupported)

    /** A known theme id this device supports, or the default. */
    fun resolve(id: String?): String = if (id != null && isSupported(id)) id else DEFAULT

    fun create(id: String?): AssistantTheme {
        val theme = resolve(id)
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                when (theme) {
                    HALFTONE -> return HalftoneTheme()
                    TERRAIN -> return TerrainTheme()
                    PAINTERLY -> return PainterlyTheme()
                }
            }
            RainbowTheme()
        } catch (e: Exception) {
            // A shader that does not compile on this GPU/driver must never leave the overlay blank.
            Log.e(TAG, "Could not create the $theme theme - using the default", e)
            RainbowTheme()
        }
    }

    fun stored(context: Context): String = try {
        resolve(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_THEME, null))
    } catch (e: Exception) {
        Log.w(TAG, "Could not read the assistant theme", e)
        DEFAULT
    }

    /** Save a theme (an unknown one saves the default); returns what was saved. */
    fun store(context: Context, id: String?): String {
        val theme = resolve(id)
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_THEME, theme).apply()
        return theme
    }

    /** Whether the background moves (the default) or is drawn once as a still picture, to save battery and heat. */
    fun animated(context: Context): Boolean = try {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ANIMATED, true)
    } catch (e: Exception) {
        Log.w(TAG, "Could not read the assistant animation setting", e)
        true
    }

    fun storeAnimated(context: Context, animated: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_ANIMATED, animated).apply()
    }
}
