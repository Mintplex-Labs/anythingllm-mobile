package com.anythingllm.browseruse

import android.content.Context
import android.util.Log
import android.webkit.CookieManager
import android.webkit.WebStorage
import android.webkit.WebView
import androidx.webkit.ProfileStore
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

/**
 * Browser profiles for the browser agent - the mobile counterpart of the desktop ProfileStore
 * (electron/main/utils/BrowserUse/profiles.ts).
 *
 * Each profile is an androidx.webkit `Profile` (its own cookie jar, storage and cache) named
 * `browser-use-<id>`, so logins made for the agent never leak into the web scraper, which runs on
 * the app's default WebView profile. WebView versions without MULTI_PROFILE get a single Default
 * profile on the app's default WebView profile instead.
 *
 * Android has no API to list every cookie in a jar (CookieManager only answers "cookies for this
 * URL"), so the sites a profile has visited are recorded here and looked up one by one.
 *
 * Main thread only - every caller in BrowserUseModule posts to the main looper.
 */
class BrowserUseProfiles(context: Context) {
    companion object {
        private const val TAG = "BrowserUseProfiles"
        const val DEFAULT_ID = "default"
        private const val DEFAULT_NAME = "Default"
        private const val PROFILE_PREFIX = "browser-use-"
        private const val MAX_SITES = 300

        fun multiProfileSupported(): Boolean =
            WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)
    }

    data class Profile(val id: String, var name: String, val createdAt: Long, val sites: LinkedHashMap<String, Long>)

    private val file = File(context.filesDir, "browser-use/profiles.json")
    private val profiles = LinkedHashMap<String, Profile>()
    private var saveScheduled = false
    private val handler = android.os.Handler(android.os.Looper.getMainLooper())

    init {
        load()
        if (!profiles.containsKey(DEFAULT_ID)) {
            profiles[DEFAULT_ID] = Profile(DEFAULT_ID, DEFAULT_NAME, System.currentTimeMillis(), LinkedHashMap())
            save()
        }
    }

    fun all(): List<Profile> = profiles.values.toList()

    fun get(id: String?): Profile? = id?.let { profiles[it] }

    /** The profile the agent asked for by name (case-insensitive), else Default. */
    fun byName(name: String?): Profile {
        val wanted = name?.trim()?.lowercase()
        if (!wanted.isNullOrEmpty()) profiles.values.firstOrNull { it.name.lowercase() == wanted }?.let { return it }
        return profiles[DEFAULT_ID]!!
    }

    fun create(name: String): Profile {
        if (!multiProfileSupported()) throw IllegalStateException("This device's WebView does not support more than one browser profile.")
        val clean = name.trim().take(40)
        if (clean.isEmpty()) throw IllegalArgumentException("A profile needs a name.")
        if (profiles.values.any { it.name.equals(clean, ignoreCase = true) }) throw IllegalArgumentException("A profile named \"$clean\" already exists.")
        val profile = Profile(UUID.randomUUID().toString(), clean, System.currentTimeMillis(), LinkedHashMap())
        profiles[profile.id] = profile
        save()
        return profile
    }

    fun rename(id: String, name: String) {
        val profile = profiles[id] ?: throw IllegalArgumentException("Unknown profile.")
        val clean = name.trim().take(40)
        if (clean.isEmpty()) throw IllegalArgumentException("A profile needs a name.")
        profile.name = clean
        save()
    }

    /** Wipes the profile and removes it. The Default profile can only be cleared. Callers close its sessions first. */
    fun delete(context: Context, id: String) {
        if (id == DEFAULT_ID) throw IllegalArgumentException("The Default profile cannot be deleted.")
        if (!profiles.containsKey(id)) return
        clear(context, id)
        if (multiProfileSupported()) {
            try {
                ProfileStore.getInstance().deleteProfile(webkitNameFor(id)!!)
            } catch (e: Exception) {
                // Still in use by a WebView that has not been destroyed yet - the data is already wiped.
                Log.w(TAG, "Could not delete WebView profile for $id", e)
            }
        }
        profiles.remove(id)
        save()
    }

    /** Signs the profile out of everything: cookies, site storage and the HTTP cache. */
    fun clear(context: Context, id: String) {
        val profile = profiles[id] ?: return
        val cookies = cookieManager(id)
        cookies.removeAllCookies(null)
        cookies.flush()
        webStorage(id).deleteAllData()
        clearCache(context, id)
        profile.sites.clear()
        save()
    }

    /**
     * The sites a profile visited with the cookies it holds for each, newest first. Hosts are
     * grouped by site (www.x.com and x.com are one row). Cookie values never leave native code.
     */
    fun sites(id: String): JSONArray {
        val profile = profiles[id] ?: return JSONArray()
        val cookies = cookieManager(id)
        val grouped = LinkedHashMap<String, Pair<Long, MutableSet<String>>>()
        for ((host, visited) in profile.sites.entries.sortedByDescending { it.value }) {
            val site = siteOf(host)
            val names = cookieNames(cookies, host)
            val entry = grouped.getOrPut(site) { visited to mutableSetOf() }
            entry.second.addAll(names)
            if (visited > entry.first) grouped[site] = visited to entry.second
        }
        val out = JSONArray()
        for ((site, entry) in grouped) {
            out.put(JSONObject().apply {
                put("host", site)
                put("lastVisited", entry.first)
                put("cookieCount", entry.second.size)
                put("cookies", JSONArray(entry.second.sorted()))
            })
        }
        return out
    }

    /**
     * Best-effort "forget this site": expires every cookie the jar returns for the site's hosts and
     * deletes their web storage. Cookies scoped to a path other than "/" cannot be addressed without
     * knowing the path, so a few may survive - clearing the whole profile always works.
     */
    fun forgetSite(id: String, site: String) {
        val profile = profiles[id] ?: return
        val cookies = cookieManager(id)
        val storage = webStorage(id)
        val hosts = profile.sites.keys.filter { siteOf(it) == site }.toMutableSet().apply { add(site) }
        for (host in hosts) {
            val domains = linkedSetOf(host, ".$host", ".$site", site)
            for (name in cookieNames(cookies, host)) {
                for (scheme in listOf("https", "http")) {
                    val url = "$scheme://$host"
                    cookies.setCookie(url, "$name=; Max-Age=0; Path=/")
                    for (domain in domains) cookies.setCookie(url, "$name=; Max-Age=0; Path=/; Domain=$domain")
                }
            }
            storage.deleteOrigin("https://$host")
            storage.deleteOrigin("http://$host")
            profile.sites.remove(host)
        }
        cookies.flush()
        save()
    }

    /** A top-level page finished loading in this profile. */
    fun recordVisit(id: String, url: String?) {
        val profile = profiles[id] ?: return
        if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) return
        val host = try { android.net.Uri.parse(url).host } catch (e: Exception) { null } ?: return
        profile.sites.remove(host)
        profile.sites[host] = System.currentTimeMillis()
        while (profile.sites.size > MAX_SITES) profile.sites.remove(profile.sites.keys.first())
        scheduleSave()
    }

    /** The androidx.webkit profile name, or null when the device only has the default WebView profile. */
    fun webkitNameFor(id: String): String? =
        if (multiProfileSupported()) "$PROFILE_PREFIX$id" else null

    /** Puts a freshly constructed WebView on the profile. Must run before anything else touches the WebView. */
    fun applyTo(webView: WebView, id: String) {
        val name = webkitNameFor(id) ?: return
        ProfileStore.getInstance().getOrCreateProfile(name)
        WebViewCompat.setProfile(webView, name)
    }

    fun cookieManager(id: String): CookieManager {
        val name = webkitNameFor(id) ?: return CookieManager.getInstance()
        return ProfileStore.getInstance().getOrCreateProfile(name).cookieManager
    }

    private fun webStorage(id: String): WebStorage {
        val name = webkitNameFor(id) ?: return WebStorage.getInstance()
        return ProfileStore.getInstance().getOrCreateProfile(name).webStorage
    }

    /** The HTTP cache is per profile but only reachable through a WebView on it. */
    private fun clearCache(context: Context, id: String) {
        try {
            val view = WebView(context)
            applyTo(view, id)
            view.clearCache(true)
            view.destroy()
        } catch (e: Exception) {
            Log.w(TAG, "Could not clear the cache for $id", e)
        }
    }

    private fun cookieNames(cookies: CookieManager, host: String): Set<String> {
        val names = linkedSetOf<String>()
        for (scheme in listOf("https", "http")) {
            val header = cookies.getCookie("$scheme://$host") ?: continue
            for (part in header.split(";")) {
                val name = part.substringBefore("=").trim()
                if (name.isNotEmpty()) names.add(name)
            }
        }
        return names
    }

    /** The last two labels of a host - x.com for api.x.com and www.x.com. */
    private fun siteOf(host: String): String {
        val labels = host.removePrefix("www.").split(".")
        return if (labels.size <= 2) labels.joinToString(".") else labels.takeLast(2).joinToString(".")
    }

    private fun load() {
        try {
            if (!file.exists()) return
            val root = JSONObject(file.readText())
            val list = root.optJSONArray("profiles") ?: return
            for (i in 0 until list.length()) {
                val item = list.getJSONObject(i)
                val sites = LinkedHashMap<String, Long>()
                val rawSites = item.optJSONObject("sites")
                rawSites?.keys()?.forEach { host -> sites[host] = rawSites.optLong(host) }
                val profile = Profile(item.getString("id"), item.optString("name", DEFAULT_NAME), item.optLong("createdAt"), sites)
                profiles[profile.id] = profile
            }
        } catch (e: Exception) {
            Log.e(TAG, "Could not read browser profiles", e)
        }
    }

    private fun scheduleSave() {
        if (saveScheduled) return
        saveScheduled = true
        handler.postDelayed({ saveScheduled = false; save() }, 2_000)
    }

    fun save() {
        try {
            val list = JSONArray()
            for (profile in profiles.values) {
                list.put(JSONObject().apply {
                    put("id", profile.id)
                    put("name", profile.name)
                    put("createdAt", profile.createdAt)
                    put("sites", JSONObject().apply { profile.sites.forEach { (host, at) -> put(host, at) } })
                })
            }
            file.parentFile?.mkdirs()
            val tmp = File(file.parentFile, "${file.name}.tmp")
            tmp.writeText(JSONObject().put("profiles", list).toString())
            tmp.renameTo(file)
        } catch (e: Exception) {
            Log.e(TAG, "Could not save browser profiles", e)
        }
    }
}
