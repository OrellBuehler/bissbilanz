package com.bissbilanz.android.bulk

import com.bissbilanz.ErrorReporter
import com.bissbilanz.foodpackage.BulkUploadStep
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class BulkUploadRunnerTest {
    private val reported = mutableListOf<Throwable>()
    private val waits = mutableListOf<Long>()
    private var clock = 0L
    private var paused = false
    private val progress = mutableListOf<Int>()

    private fun runner(
        steps: ArrayDeque<BulkUploadStep>,
        budgetMs: Long = BulkUploadRunner.DEFAULT_BUDGET_MS,
        onStep: () -> Unit = {},
    ) = BulkUploadRunner(
        uploadNext = {
            onStep()
            steps.removeFirstOrNull() ?: BulkUploadStep.Idle
        },
        isPaused = { paused },
        onProgress = { progress.add(it) },
        errorReporter =
            object : ErrorReporter {
                override fun captureException(e: Throwable) {
                    reported.add(e)
                }
            },
        now = { clock },
        pause = {
            waits.add(it)
            clock += it
        },
        budgetMs = budgetMs,
    )

    private fun steps(vararg step: BulkUploadStep) = ArrayDeque(step.toList())

    @Test
    fun keepsSendingUntilTheQueueIsEmpty() =
        runTest {
            val outcome =
                runner(steps(BulkUploadStep.Progress(200, 0), BulkUploadStep.Progress(200, 1), BulkUploadStep.Progress(50, 0)))
                    .run("user-1")

            assertEquals(BulkUploadRunner.Outcome.DONE, outcome)
            assertEquals(listOf(200, 400, 450), progress)
        }

    @Test
    fun stopsAtOnceWhenThePauseSwitchIsOn() =
        runTest {
            val queue = steps(BulkUploadStep.Progress(200, 0), BulkUploadStep.Progress(200, 0))

            val outcome = runner(queue, onStep = { paused = true }).run("user-1")

            assertEquals(BulkUploadRunner.Outcome.PAUSED, outcome)
            assertEquals(1, queue.size)
        }

    @Test
    fun waitsOutARateLimitThenCarriesOn() =
        runTest {
            val outcome = runner(steps(BulkUploadStep.RateLimited(7_000), BulkUploadStep.Progress(10, 0))).run("user-1")

            assertEquals(BulkUploadRunner.Outcome.DONE, outcome)
            assertEquals(listOf(7_000L), waits)
        }

    @Test
    fun handsTheRestToTheNextRunWhenTheWaitWouldOutlastThisRunsBudget() =
        runTest {
            val outcome = runner(steps(BulkUploadStep.RateLimited(60_000)), budgetMs = 30_000).run("user-1")

            assertEquals(BulkUploadRunner.Outcome.CONTINUE_LATER, outcome)
            assertTrue(waits.isEmpty())
        }

    @Test
    fun startsAnotherRunWhenTheTimeBudgetIsUsedUp() =
        runTest {
            val queue = steps(BulkUploadStep.Progress(200, 0), BulkUploadStep.Progress(200, 0), BulkUploadStep.Progress(200, 0))

            val outcome = runner(queue, budgetMs = 1_000, onStep = { clock += 600 }).run("user-1")

            assertEquals(BulkUploadRunner.Outcome.CONTINUE_LATER, outcome)
            assertEquals(1, queue.size)
        }

    @Test
    fun retriesAFailingRequestWithGrowingWaitsThenReportsOnceAndAsksForARetry() =
        runTest {
            val cause = java.io.IOException("offline")
            val outcome =
                runner(steps(BulkUploadStep.Transient(cause), BulkUploadStep.Transient(cause), BulkUploadStep.Transient(cause)))
                    .run("user-1")

            assertEquals(BulkUploadRunner.Outcome.RETRY, outcome)
            assertEquals(listOf(5_000L, 10_000L), waits)
            assertEquals(listOf<Throwable>(cause), reported)
        }

    @Test
    fun aRequestThatWorksAgainResetsTheFailureCount() =
        runTest {
            val cause = java.io.IOException("offline")
            val outcome =
                runner(
                    steps(
                        BulkUploadStep.Transient(cause),
                        BulkUploadStep.Transient(cause),
                        BulkUploadStep.Progress(10, 0),
                        BulkUploadStep.Transient(cause),
                        BulkUploadStep.Transient(cause),
                    ),
                ).run("user-1")

            assertEquals(BulkUploadRunner.Outcome.DONE, outcome)
            assertTrue(reported.isEmpty())
        }

    @Test
    fun anExpiredSessionOrAnOldAppLeavesTheQueueForWorkManagersRetry() =
        runTest {
            assertEquals(BulkUploadRunner.Outcome.RETRY, runner(steps(BulkUploadStep.Unauthorized)).run("u"))
            assertEquals(BulkUploadRunner.Outcome.RETRY, runner(steps(BulkUploadStep.UpdateRequired)).run("u"))
            assertTrue(reported.isEmpty())
        }
}
