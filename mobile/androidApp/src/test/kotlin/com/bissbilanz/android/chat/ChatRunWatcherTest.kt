package com.bissbilanz.android.chat

import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.ui.viewmodels.ChatTestFixtures.event
import com.bissbilanz.android.ui.viewmodels.ChatTestFixtures.run
import com.bissbilanz.api.ApiException
import com.bissbilanz.api.ChatEventPage
import com.bissbilanz.api.ChatStreamItem
import com.bissbilanz.api.generated.model.ChatChange
import com.bissbilanz.api.generated.model.ChatRun
import com.bissbilanz.chat.ChatChangeScope
import com.bissbilanz.chat.ChatDomain
import com.bissbilanz.chat.ChatRefreshPlan
import com.bissbilanz.repository.ChatRepository
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals

@OptIn(ExperimentalCoroutinesApi::class)
class ChatRunWatcherTest {
    private var account = 0
    private val chatRepo: ChatRepository = mockk(relaxed = true) { every { accountGeneration } answers { account } }
    private val refresher: ChatDataRefresher = mockk(relaxed = true)
    private val waits = mutableListOf<Long>()
    private val polledFrom = mutableListOf<Int>()
    private val pages = ArrayDeque<suspend () -> ChatEventPage>()
    private val entries = listOf(ChatChange(domain = ChatDomain.ENTRIES, dates = listOf("2026-11-18")))

    private fun TestScope.watcher(): ChatRunWatcher {
        coEvery { chatRepo.pollRun("c1", any()) } coAnswers {
            polledFrom += secondArg<Int>()
            (pages.removeFirstOrNull() ?: { awaitCancellation() })()
        }
        val errorReporter: ErrorReporter = mockk(relaxed = true)
        return ChatRunWatcher(chatRepo, refresher, ViewedDiaryDay(), errorReporter, backgroundScope, wait = { waits += it }, now = { 0L })
    }

    private fun page(
        vararg events: ChatStreamItem,
        activeRun: ChatRun? = run("running", "c1"),
    ): ChatEventPage {
        val last = events.filterIsInstance<ChatStreamItem.Event>().maxOfOrNull { it.event.seq } ?: 0
        return ChatEventPage(events.toList(), nextAfter = last, lastSeq = last, hasMore = false, activeRun = activeRun)
    }

    private val entriesPlan = ChatRefreshPlan(mapOf(ChatDomain.ENTRIES to ChatChangeScope(dates = setOf("2026-11-18"))))

    @Test
    fun aRunLeftBehindIsPolledForItsChangesUntilItEnds() =
        runTest {
            val watcher = watcher()
            pages += { page(ChatStreamItem.Event(event(7, "tool_finished", partIndex = 1, status = "ok", changes = entries))) }
            pages +=
                {
                    page(
                        ChatStreamItem.Event(
                            event(8, "run_finished", status = "completed", run = run("completed", "c1"), changes = entries),
                        ),
                        activeRun = null,
                    )
                }

            watcher.watch("c1", 6)
            runCurrent()

            assertEquals(listOf(6, 7), polledFrom)
            verify(exactly = 2) { refresher.request(entriesPlan, null) }
            verify { chatRepo.noteActiveRun("c1", null) }
            assertEquals(listOf(ChatRunWatcher.WORKING_MS), waits)
        }

    @Test
    fun aRunWaitingForTheUserIsPolledSlowly() =
        runTest {
            val watcher = watcher()
            pages += { page(activeRun = run("awaiting_confirmation", "c1")) }

            watcher.watch("c1", 6)
            runCurrent()

            assertEquals(listOf(ChatRunWatcher.WAITING_MS), waits)
        }

    @Test
    fun theScreenTakingOverStopsThePoll() =
        runTest {
            val watcher = watcher()
            val gate = CompletableDeferred<ChatEventPage>()
            pages += { gate.await() }

            watcher.watch("c1", 6)
            runCurrent()
            watcher.stop("c1")
            gate.complete(page(ChatStreamItem.Event(event(7, "tool_finished", partIndex = 1, status = "ok", changes = entries))))
            runCurrent()

            verify(exactly = 0) { refresher.request(any(), any()) }
        }

    @Test
    fun aGoneConversationEndsTheWatch() =
        runTest {
            val watcher = watcher()
            pages += { throw ApiException("gone", 404) }

            watcher.watch("c1", 6)
            runCurrent()

            assertEquals(listOf(6), polledFrom)
            assertEquals(emptyList(), waits)
        }

    @Test
    fun aSignOutEndsTheWatch() =
        runTest {
            val watcher = watcher()
            pages += {
                account++
                page()
            }

            watcher.watch("c1", 6)
            runCurrent()

            assertEquals(listOf(6), polledFrom)
            coVerify(exactly = 1) { chatRepo.pollRun(any(), any()) }
        }
}
