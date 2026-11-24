package com.anythingllm.network

import android.content.Context
import android.util.Log
import com.facebook.react.modules.network.CookieJarContainer
import com.facebook.react.modules.network.OkHttpClientProvider
import com.facebook.react.modules.network.ReactCookieJarContainer
import java.io.File
import okhttp3.Cache
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl

/**
 * React Native's cookie jar, except that a cookie it cannot read or write does not crash the app.
 *
 * RN reads cookies through okhttp's `JavaNetCookieJar`, which throws on some values the WebView
 * `CookieManager` happily stores - a value of just `"` fails its quote stripping with a
 * StringIndexOutOfBoundsException (GH #150). It throws on OkHttp's dispatcher thread, so the app
 * crashes, and keeps crashing on every request to that host until its cookies are cleared. Any
 * site can store such a cookie: a `Set-Cookie` header on a `fetch` response, or a page the web
 * scraper loads. Here a request whose cookies cannot be read goes out without cookies instead.
 */
class SafeCookieJarContainer : CookieJarContainer {
    private val delegate = ReactCookieJarContainer()

    override fun setCookieJar(cookieJar: CookieJar) = delegate.setCookieJar(cookieJar)

    override fun removeCookieJar() = delegate.removeCookieJar()

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        try {
            delegate.saveFromResponse(url, cookies)
        } catch (e: RuntimeException) {
            Log.w(TAG, "Could not save cookies for ${url.host}: $e")
        }
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> =
        try {
            delegate.loadForRequest(url)
        } catch (e: RuntimeException) {
            Log.w(TAG, "Could not read cookies for ${url.host}, sending the request without them: $e")
            emptyList()
        }

    companion object {
        private const val TAG = "SafeCookieJar"

        /**
         * Builds every client RN asks `OkHttpClientProvider` for (networking, images, video) with
         * [SafeCookieJarContainer]. A factory replaces RN's own client setup, so this keeps the 10MB
         * HTTP cache RN gives `fetch` - one `Cache` shared by every client, since two caches on the
         * same directory corrupt each other.
         */
        fun install(context: Context) {
            val cache = Cache(File(context.cacheDir, "http-cache"), 10L * 1024 * 1024)
            OkHttpClientProvider.setOkHttpClientFactory {
                OkHttpClientProvider.createClientBuilder()
                    .cache(cache)
                    .cookieJar(SafeCookieJarContainer())
                    .build()
            }
        }
    }
}
