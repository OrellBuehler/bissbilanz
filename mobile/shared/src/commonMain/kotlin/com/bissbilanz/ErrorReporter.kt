package com.bissbilanz

interface ErrorReporter {
    fun captureException(e: Throwable)

    fun addBreadcrumb(
        message: String,
        category: String,
    ) {}
}
