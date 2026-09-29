package com.bissbilanz.android

import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.ApiException
import com.bissbilanz.api.HTTP_STATUS_UPDATE_REQUIRED
import com.bissbilanz.api.UnauthorizedException
import io.sentry.Sentry
import java.io.IOException

class SentryErrorReporter : ErrorReporter {
    override fun captureException(e: Throwable) {
        if (e is UnauthorizedException) return
        if (e is ApiException && e.statusCode == HTTP_STATUS_UPDATE_REQUIRED) return
        // Suppress transient network failures (offline, flaky cellular, DNS hiccup).
        // Ktor's ConnectTimeoutException/SocketTimeoutException and friends all
        // extend IOException; ApiException (our HTTP-status wrapper) does not.
        if (e.isTransientNetworkFailure()) return
        Sentry.captureException(e)
    }
}

private fun Throwable.isTransientNetworkFailure(): Boolean {
    var current: Throwable? = this
    while (current != null) {
        if (current is IOException) return true
        current = current.cause
    }
    return false
}
