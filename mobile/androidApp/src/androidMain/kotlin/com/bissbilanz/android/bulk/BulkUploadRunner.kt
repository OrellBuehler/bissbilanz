package com.bissbilanz.android.bulk

import com.bissbilanz.ErrorReporter
import com.bissbilanz.foodpackage.BulkUploadStep
import kotlinx.coroutines.delay

/**
 * The loop behind [BulkUploadWorker]: keeps sending batches until nothing is left, the user
 * pauses, WorkManager stops the worker, or this run has used its time budget (a normal worker
 * is stopped after about ten minutes, so a long upload is a chain of runs). It checks for a stop
 * between batches, so a batch in flight finishes and is never repeated.
 *
 * A 429 waits out the server's `Retry-After`. A failed request is retried with growing waits
 * and, when it keeps failing, reported once and handed back to WorkManager's own backoff.
 */
class BulkUploadRunner(
    private val uploadNext: suspend (String) -> BulkUploadStep,
    private val isPaused: () -> Boolean,
    private val isStopped: () -> Boolean = { false },
    private val onProgress: suspend (handled: Int) -> Unit,
    private val errorReporter: ErrorReporter,
    private val now: () -> Long = System::currentTimeMillis,
    private val pause: suspend (Long) -> Unit = { delay(it) },
    private val budgetMs: Long = DEFAULT_BUDGET_MS,
) {
    enum class Outcome {
        /** Everything is uploaded. */
        DONE,

        /** The user paused (or the account is gone): leave the rest queued. */
        PAUSED,

        /** More is left but this run's time is up: start another. */
        CONTINUE_LATER,

        /** WorkManager stopped this worker (time limit, constraints, process pressure): it is re-queued. */
        STOPPED,

        /** Offline, signed out, update required: let WorkManager retry with backoff. */
        RETRY,
    }

    suspend fun run(userId: String): Outcome {
        val deadline = now() + budgetMs
        var failures = 0
        var handled = 0
        while (true) {
            if (isPaused()) return Outcome.PAUSED
            if (isStopped()) return Outcome.STOPPED
            if (now() >= deadline) return Outcome.CONTINUE_LATER
            when (val step = uploadNext(userId)) {
                BulkUploadStep.Idle -> return Outcome.DONE
                is BulkUploadStep.Progress -> {
                    failures = 0
                    handled += step.handled
                    onProgress(handled)
                }
                is BulkUploadStep.RateLimited -> {
                    if (now() + step.retryAfterMs >= deadline) return Outcome.CONTINUE_LATER
                    pause(step.retryAfterMs)
                }
                is BulkUploadStep.Transient -> {
                    failures++
                    if (failures >= MAX_CONSECUTIVE_FAILURES) {
                        errorReporter.captureException(step.cause)
                        return Outcome.RETRY
                    }
                    pause(BACKOFF_BASE_MS shl (failures - 1))
                }
                BulkUploadStep.Unauthorized, BulkUploadStep.UpdateRequired -> return Outcome.RETRY
            }
        }
    }

    companion object {
        const val DEFAULT_BUDGET_MS = 8L * 60 * 1000
        const val MAX_CONSECUTIVE_FAILURES = 3
        const val BACKOFF_BASE_MS = 5_000L
    }
}
