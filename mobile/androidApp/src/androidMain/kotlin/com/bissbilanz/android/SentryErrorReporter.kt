package com.bissbilanz.android

import com.bissbilanz.ErrorReporter
import io.sentry.Sentry

class SentryErrorReporter : ErrorReporter {
    override fun captureException(e: Throwable) {
        Sentry.captureException(e)
    }
}
