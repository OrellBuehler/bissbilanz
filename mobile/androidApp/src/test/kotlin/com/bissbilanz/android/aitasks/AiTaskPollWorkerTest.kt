package com.bissbilanz.android.aitasks

import androidx.work.ListenableWorker.Result
import com.bissbilanz.api.ApiException
import com.bissbilanz.api.UnauthorizedException
import java.io.IOException
import kotlin.test.Test
import kotlin.test.assertEquals

class AiTaskPollWorkerTest {
    @Test
    fun aSignedOutUserEndsTheWorkInsteadOfRetrying() {
        assertEquals(Result.success(), AiTaskPollWorker.afterFailure(UnauthorizedException(), replyCheck = true, runAttemptCount = 0))
        assertEquals(Result.success(), AiTaskPollWorker.afterFailure(UnauthorizedException(), replyCheck = false, runAttemptCount = 0))
    }

    @Test
    fun theReplyCheckGivesUpAfterItsAttempts() {
        val last = AiTaskPollWorker.MAX_REPLY_CHECK_ATTEMPTS - 1
        repeat(last) { attempt ->
            assertEquals(
                Result.retry(),
                AiTaskPollWorker.afterFailure(IOException("offline"), replyCheck = true, runAttemptCount = attempt),
            )
        }
        assertEquals(Result.failure(), AiTaskPollWorker.afterFailure(ApiException("boom", 500), replyCheck = true, runAttemptCount = last))
    }

    @Test
    fun thePeriodicPollKeepsRetrying() {
        assertEquals(Result.retry(), AiTaskPollWorker.afterFailure(IOException("offline"), replyCheck = false, runAttemptCount = 20))
    }
}
