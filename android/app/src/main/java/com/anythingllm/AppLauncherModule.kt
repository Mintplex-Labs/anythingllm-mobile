package com.anythingllm

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Launches other apps on the device by name or by a URI/package the model supplies.
 *
 * The model never sees package names or URIs it has to guess - it asks for an app by its
 * common name ("Spotify", "Maps", "Settings") and this module resolves that to a launchable
 * intent. Resolution order:
 *   1. an explicit package (com.spotify.music) -> getLaunchIntentForPackage
 *   2. a URI (spotify://, market://, https://) -> ACTION_VIEW
 *   3. a display name -> the installed app whose label matches (case-insensitive, substring)
 *
 * Launching another app is a real side effect, so the JS tool gates it behind the standard
 * tool-approval card (see tools/openApp). This module only resolves and fires the intent.
 */
class AppLauncherModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "AppLauncherModule"

    @ReactMethod
    fun launch(target: String, promise: Promise) {
        try {
            val intent = resolveIntent(target)
            if (intent == null) {
                promise.reject("APP_NOT_FOUND", "No app found for \"$target\"")
                return
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("LAUNCH_FAILED", e.message ?: "Could not launch app")
        }
    }

    /** Resolve a model-supplied target to a launchable intent, or null if nothing matches. */
    private fun resolveIntent(target: String): Intent? {
        val t = target.trim()
        if (t.isEmpty()) return null

        // 1. Explicit package name.
        if (t.contains('.')) {
            val pkg = reactApplicationContext.packageManager.getLaunchIntentForPackage(t)
            if (pkg != null) return pkg
        }

        // 2. A URI with a scheme (spotify://, market://, https://, intent:#Intent;...).
        if (t.contains("://") || t.startsWith("intent:")) {
            try {
                val uri = Uri.parse(t)
                val view = Intent(Intent.ACTION_VIEW, uri)
                if (view.resolveActivity(reactApplicationContext.packageManager) != null) return view
            } catch (_: Exception) {
                // fall through to name matching
            }
        }

        // 3. Display-name match against installed apps.
        return resolveByName(t)
    }

    private fun resolveByName(name: String): Intent? {
        val pm = reactApplicationContext.packageManager
        val query = name.lowercase()
        val launchIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val resolved = pm.queryIntentActivities(launchIntent, PackageManager.MATCH_ALL)
        var best: android.content.pm.ResolveInfo? = null
        var bestScore = 0
        for (ri in resolved) {
            val label = ri.loadLabel(pm)?.toString() ?: continue
            val l = label.lowercase()
            if (l == query) { best = ri; bestScore = Int.MAX_VALUE; break }
            if (l.contains(query) && query.length > bestScore) { best = ri; bestScore = query.length }
        }
        if (best == null) return null
        return pm.getLaunchIntentForPackage(best.activityInfo.packageName)
    }
}
