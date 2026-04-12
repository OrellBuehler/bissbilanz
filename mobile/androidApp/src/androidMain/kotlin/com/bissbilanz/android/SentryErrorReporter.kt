package com.bissbilanz.android

import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.UnauthorizedException
import io.sentry.Sentry

class SentryErrorReporter : ErrorReporter {
    override fun captureException(e: Throwable) {
        if (e is UnauthorizedException) return
        Sentry.captureException(e)
    }
}
