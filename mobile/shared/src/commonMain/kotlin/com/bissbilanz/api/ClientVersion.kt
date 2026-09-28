package com.bissbilanz.api

import io.ktor.client.HttpClientConfig
import io.ktor.client.plugins.HttpResponseValidator
import io.ktor.client.request.header
import io.ktor.client.statement.HttpResponse
import io.ktor.http.HttpMessageBuilder
import io.ktor.http.Url
import io.ktor.http.isSuccess
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

const val HEADER_CLIENT_PLATFORM = "X-Client-Platform"
const val HEADER_CLIENT_VERSION = "X-Client-Version"
const val HEADER_CLIENT_MIN_VERSION = "X-Client-Min-Version"

/** The server's answer to a build older than it will serve — see [UpdateGate]. */
const val HTTP_STATUS_UPDATE_REQUIRED = 426

/** [minVersion] is the server's `X-Client-Min-Version`, when it sent one. */
data class UpdateRequired(
    val minVersion: String?,
)

/**
 * App-wide flag set the moment any request to the Bissbilanz API answers 426 (this
 * build is older than the server will serve). [BissbilanzApi] and [com.bissbilanz.auth.AuthManager]
 * both feed it from their own HTTP clients — either can be the first request out after
 * launch — and the app layer observes [state] to show a blocking "update required"
 * screen and to gate the sync queue and background workers.
 */
class UpdateGate {
    private val _state = MutableStateFlow<UpdateRequired?>(null)
    val state: StateFlow<UpdateRequired?> = _state.asStateFlow()

    fun flag(minVersion: String?) {
        _state.value = UpdateRequired(minVersion)
    }

    /** Called once a request to the same host succeeds, so an update clears the gate without a restart. */
    fun clear() {
        _state.value = null
    }
}

/**
 * Strips a build metadata/pre-release suffix (e.g. `1.53.0-debug` -> `1.53.0`) so the
 * marketing version name parses as plain `MAJOR.MINOR.PATCH` for the server. A local
 * `dev` build (no dash) passes through unchanged; the server treats an unparsable
 * version conservatively.
 */
fun sanitizeClientVersion(versionName: String): String = versionName.substringBefore('-').substringBefore('+')

fun HttpMessageBuilder.applyClientVersionHeaders(
    platform: String,
    version: String?,
) {
    header(HEADER_CLIENT_PLATFORM, platform)
    if (version != null) header(HEADER_CLIENT_VERSION, version)
}

/**
 * Watches every response from [baseUrl]'s host for the 426 the server answers with once
 * this build is too old, and flags [updateGate] with the `X-Client-Min-Version` header
 * rather than the (possibly absent or malformed) JSON body. A later success from the
 * same host clears the gate, so updating the app resumes without a restart. Scoped to
 * [baseUrl]'s host so a client that also fetches other hosts (e.g. [BissbilanzApi]'s
 * `downloadBytes` for a third-party image URL) can't be flagged by an unrelated host.
 */
fun HttpClientConfig<*>.installUpdateGate(
    baseUrl: String,
    updateGate: UpdateGate,
) {
    val expectedHost = Url(baseUrl).host
    HttpResponseValidator {
        validateResponse { response: HttpResponse ->
            if (response.call.request.url.host != expectedHost) return@validateResponse
            when {
                response.status.value == HTTP_STATUS_UPDATE_REQUIRED ->
                    updateGate.flag(response.headers[HEADER_CLIENT_MIN_VERSION])
                response.status.isSuccess() -> updateGate.clear()
            }
        }
    }
}
