package com.bissbilanz.android

import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.UnauthorizedException
import io.sentry.Sentry
import java.io.IOException

class SentryErrorReporter : ErrorReporter {
    override fun captureException(e: Throwable) {
        if (e is UnauthorizedException) return
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
