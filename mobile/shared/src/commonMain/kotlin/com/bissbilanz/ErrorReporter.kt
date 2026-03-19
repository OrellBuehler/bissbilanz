package com.bissbilanz

interface ErrorReporter {
    fun captureException(e: Throwable)
}
