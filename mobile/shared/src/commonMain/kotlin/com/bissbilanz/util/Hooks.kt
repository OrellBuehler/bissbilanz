package com.bissbilanz.util

import com.bissbilanz.ErrorReporter
import kotlinx.coroutines.CancellationException

/**
 * Runs an app-supplied listener after a repository write or refresh. The write already
 * happened, so a failing listener is reported and never turned into an error of the write.
 */
inline fun ErrorReporter.runHook(hook: () -> Unit) {
    try {
        hook()
    } catch (e: Exception) {
        if (e is CancellationException) throw e
        captureException(e)
    }
}
