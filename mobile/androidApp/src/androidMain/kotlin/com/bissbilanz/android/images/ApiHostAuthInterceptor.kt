package com.bissbilanz.android.images

import kotlinx.coroutines.runBlocking
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Attaches the account's bearer token to image requests — but only to requests
 * aimed at our own API host.
 *
 * A food's `imageUrl` is either our `/uploads/…` or a public
 * `images.openfoodfacts.org` URL, and both go through the same image loader. A
 * blanket auth header would hand the user's token to Open Food Facts on every
 * product thumbnail, so the host has to be checked explicitly.
 */
class ApiHostAuthInterceptor(
    baseUrl: String,
    private val token: suspend () -> String?,
) : Interceptor {
    private val apiUrl: HttpUrl? = baseUrl.toHttpUrlOrNull()

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (!isApiHost(request.url)) return chain.proceed(request)
        val accessToken = runBlocking { token() } ?: return chain.proceed(request)
        return chain.proceed(
            request
                .newBuilder()
                .header("Authorization", "Bearer $accessToken")
                .build(),
        )
    }

    /**
     * Scheme, host and port must all match. Host alone would leak the token to a
     * plaintext `http://` variant of the same name, and a same-host different-port
     * service is a different origin.
     */
    private fun isApiHost(url: HttpUrl): Boolean {
        val api = apiUrl ?: return false
        return url.scheme == api.scheme && url.host == api.host && url.port == api.port
    }
}
