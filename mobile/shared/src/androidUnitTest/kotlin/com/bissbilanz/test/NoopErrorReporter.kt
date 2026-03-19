package com.bissbilanz.test

import com.bissbilanz.ErrorReporter

class NoopErrorReporter : ErrorReporter {
    override fun captureException(e: Throwable) {}
}
