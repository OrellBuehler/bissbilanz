package com.bissbilanz.android

import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.ApiException
import com.bissbilanz.api.HTTP_STATUS_UPDATE_REQUIRED
import com.bissbilanz.api.UnauthorizedException
import io.sentry.Sentry
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import java.io.IOException

private val GATEWAY_ERROR_STATUSES = setOf(502, 503, 504)
private const val GATEWAY_BREADCRUMB_LIMIT = 120

class SentryErrorReporter : ErrorReporter {
    override fun captureException(e: Throwable) {
        if (e is UnauthorizedException) return
        if (e.isCoroutineCancellation()) return
        if (e is ApiException && e.statusCode == HTTP_STATUS_UPDATE_REQUIRED) return
        // A proxy answering 502/503/504 means the server was restarting or unreachable
        // behind it (a deploy, an upstream blip), not a defect in the app. Keep a
        // breadcrumb so a later event shows it. A 500 is the server's own bug and is
        // still reported.
        if (e.isGatewayError()) {
            Sentry.addBreadcrumb("Gateway error: ${e.message.orEmpty().take(GATEWAY_BREADCRUMB_LIMIT)}", "api")
            return
        }
        // Suppress transient network failures (offline, flaky cellular, DNS hiccup).
        // Ktor's ConnectTimeoutException/SocketTimeoutException and friends all
        // extend IOException; ApiException (our HTTP-status wrapper) does not.
        if (e.isTransientNetworkFailure()) return
        Sentry.captureException(e)
    }

    override fun addBreadcrumb(
        message: String,
        category: String,
    ) {
        Sentry.addBreadcrumb(message, category)
    }
}

// A cancelled coroutine (screen left, job replaced by a newer one) is control flow, not
// a failure (BISSBILANZ-4F). A timeout is the one cancellation that is worth a report.
internal fun Throwable.isCoroutineCancellation(): Boolean = this is CancellationException && this !is TimeoutCancellationException

internal fun Throwable.isGatewayError(): Boolean = this is ApiException && statusCode in GATEWAY_ERROR_STATUSES

private fun Throwable.isTransientNetworkFailure(): Boolean {
    var current: Throwable? = this
    while (current != null) {
        if (current is IOException) return true
        current = current.cause
    }
    return false
}
