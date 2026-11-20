package com.bissbilanz.android.chat

import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.ChatStreamItem
import com.bissbilanz.chat.ChatEventFollower
import com.bissbilanz.chat.ChatEventType
import com.bissbilanz.chat.ChatRefreshPlan
import com.bissbilanz.chat.ChatStatus
import com.bissbilanz.chat.isPermanent
import com.bissbilanz.repository.ChatRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.IOException
import kotlin.time.Clock
import kotlin.time.Duration.Companion.minutes

/**
 * Keeps the diary in step with a run the chat screen stopped watching: "log my lunch", then
 * back to the dashboard before the answer ends. A slow JSON poll of the conversation, used only
 * for the refreshes (and the capability) its events carry, until the run ends; the screen takes
 * over again when it shows that conversation ([stop]).
 */
class ChatRunWatcher(
    private val chatRepo: ChatRepository,
    private val refresher: ChatDataRefresher,
    private val viewedDay: ViewedDiaryDay,
    private val errorReporter: ErrorReporter,
    private val scope: CoroutineScope,
    private val wait: suspend (Long) -> Unit = { delay(it) },
    private val now: () -> Long = { Clock.System.now().toEpochMilliseconds() },
) {
    private val watching = mutableMapOf<String, Job>()

    /** Watches [conversationId] from [after], its last applied seq, until its active run ends. */
    fun watch(
        conversationId: String,
        after: Int,
    ) {
        synchronized(watching) {
            watching.remove(conversationId)?.cancel()
            val job = scope.launch { poll(conversationId, after) }
            watching[conversationId] = job
            job.invokeOnCompletion { synchronized(watching) { if (watching[conversationId] == job) watching.remove(conversationId) } }
        }
    }

    fun stop(conversationId: String) {
        synchronized(watching) { watching.remove(conversationId)?.cancel() }
    }

    /** Sign-out and account switches. */
    fun clear() {
        synchronized(watching) {
            watching.values.forEach { it.cancel() }
            watching.clear()
        }
    }

    private suspend fun poll(
        conversationId: String,
        start: Int,
    ) {
        val account = chatRepo.accountGeneration
        val until = now() + MAX_WATCH.inWholeMilliseconds
        var after = start
        var failures = 0
        var catchUps = 0
        while (now() < until && account == chatRepo.accountGeneration) {
            val page =
                try {
                    chatRepo.pollRun(conversationId, after)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    if (e.isPermanent()) {
                        errorReporter.addBreadcrumb("Stopped watching an assistant run: ${e.message.orEmpty().take(120)}", CATEGORY)
                        return
                    }
                    if (generateSequence<Throwable>(e) { it.cause }.none { it is IOException }) errorReporter.captureException(e)
                    failures++
                    wait(ChatEventFollower.backoffMillis(failures))
                    continue
                }
            failures = 0
            var ended = false
            page.events.forEach { item ->
                when (item) {
                    is ChatStreamItem.Event -> {
                        val event = item.event
                        after = maxOf(after, event.seq)
                        when (event.type) {
                            ChatEventType.TOOL_FINISHED -> refresh(ChatRefreshPlan.of(event.changed, event.changes))
                            ChatEventType.RUN_FINISHED -> {
                                refresh(ChatRefreshPlan.of(event.changed ?: event.run?.changed, event.changes ?: event.run?.changes))
                                chatRepo.noteActiveRun(conversationId, null)
                                ended = true
                            }
                        }
                    }
                    is ChatStreamItem.Malformed -> {
                        errorReporter.captureException(item.cause)
                        item.seq?.let { after = maxOf(after, it) }
                    }
                    else -> {}
                }
            }
            after = maxOf(after, page.nextAfter)
            if (ended) return
            if (page.hasMore) continue
            if (page.lastSeq > page.nextAfter && catchUps < ChatEventFollower.MAX_CATCH_UPS) {
                catchUps++
                wait(ChatEventFollower.POLL_CATCH_UP_MS)
                continue
            }
            catchUps = 0
            if (page.activeRun == null) return
            wait(if (ChatStatus.isWorking(page.activeRun?.status)) WORKING_MS else WAITING_MS)
        }
    }

    private fun refresh(plan: ChatRefreshPlan) = refresher.request(plan, viewedDay.current())

    companion object {
        const val WORKING_MS = 5_000L
        const val WAITING_MS = 30_000L

        /** Longer than a confirmation can wait (60 minutes). */
        val MAX_WATCH = 70.minutes
        private const val CATEGORY = "assistant-chat"
    }
}
