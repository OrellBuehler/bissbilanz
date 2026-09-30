package com.bissbilanz.wear

import io.sentry.Sentry

object WearErrors {
    fun report(e: Throwable) {
        Sentry.captureException(e)
    }
}
