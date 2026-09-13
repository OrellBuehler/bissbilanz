package com.bissbilanz.util

import com.bissbilanz.ErrorReporter

/**
 * Where shared code without an injected [ErrorReporter] sends failures it
 * recovers from (a corrupt cache row, an unparseable timestamp). Set once at
 * app start; nothing may catch an exception and discard it.
 */
object Failures {
    var reporter: ErrorReporter? = null

    fun report(e: Throwable) {
        reporter?.captureException(e)
    }
}
