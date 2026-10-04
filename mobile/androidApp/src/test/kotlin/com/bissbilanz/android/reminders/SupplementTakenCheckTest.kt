package com.bissbilanz.android.reminders

import com.bissbilanz.api.generated.model.SupplementLog
import com.bissbilanz.repository.SupplementRepository
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SupplementTakenCheckTest {
    private val repository: SupplementRepository = mockk()

    private fun log(supplementId: String) =
        SupplementLog(
            supplementId = supplementId,
            date = "2026-10-04",
            takenAt = "2026-10-04T07:00:00Z",
            entryIds = emptyList(),
        )

    @Test
    fun theServersAnswerWinsWhenItArrivesInTime() =
        runTest {
            coEvery { repository.getChecklist("2026-10-04") } returns listOf(log("s1"))
            every { repository.cachedChecklist("2026-10-04") } returns emptyList()

            assertTrue(repository.isTaken("s1", "2026-10-04"))
            assertFalse(repository.isTaken("s2", "2026-10-04"))
        }

    @Test
    fun aServerThatNeverAnswersFallsBackToTheCacheInsteadOfDroppingTheReminder() =
        runTest {
            // A dozing phone: the request hangs until the receiver's own deadline.
            coEvery { repository.getChecklist("2026-10-04") } coAnswers { awaitCancellation() }
            every { repository.cachedChecklist("2026-10-04") } returns listOf(log("s1"))

            assertTrue(repository.isTaken("s1", "2026-10-04"))
            assertFalse(repository.isTaken("s2", "2026-10-04"))
        }

    @Test
    fun aHangingServerWithAnEmptyCacheMeansNotTaken() =
        runTest {
            coEvery { repository.getChecklist("2026-10-04") } coAnswers { awaitCancellation() }
            every { repository.cachedChecklist("2026-10-04") } returns emptyList()

            assertFalse(repository.isTaken("s1", "2026-10-04"))
        }

    @Test
    fun cancellationOfTheCallerIsNotMistakenForATimeout() =
        runTest {
            coEvery { repository.getChecklist("2026-10-04") } throws CancellationException("receiver gave up")

            assertFailsWith<CancellationException> { repository.isTaken("s1", "2026-10-04") }
        }
}
