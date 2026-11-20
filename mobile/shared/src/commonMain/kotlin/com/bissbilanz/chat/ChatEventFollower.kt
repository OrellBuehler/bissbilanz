package com.bissbilanz.chat

import com.bissbilanz.api.ApiException
import com.bissbilanz.api.ChatEventPage
import com.bissbilanz.api.ChatStreamItem
import com.bissbilanz.api.UnauthorizedException
import com.bissbilanz.api.generated.model.ChatEvent
import com.bissbilanz.api.generated.model.ChatRun
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.flow
import kotlin.time.Clock

/** Both forms of a conversation's events endpoint. */
interface ChatEventSource {
    fun stream(
        conversationId: String,
        after: Int,
    ): Flow<ChatStreamItem>

    suspend fun poll(
        conversationId: String,
        after: Int,
    ): ChatEventPage
}

enum class ChatConnection { LIVE, RECONNECTING, POLLING }

sealed interface ChatFeedItem {
    data class Event(
        val event: ChatEvent,
    ) : ChatFeedItem

    data class Malformed(
        val seq: Int?,
        val cause: Exception,
    ) : ChatFeedItem

    /** A poll caught up: the run as the server has it now (a pause for a confirmation has no event). */
    data class Polled(
        val activeRun: ChatRun?,
    ) : ChatFeedItem

    data class Connection(
        val state: ChatConnection,
    ) : ChatFeedItem
}

/**
 * Follows one conversation's events until cancelled: the SSE stream, reconnected with the
 * last applied seq after it ends or breaks, with a backoff of 3 s doubling to 30 s on errors.
 * After [STREAM_FAILURES_BEFORE_POLLING] failed attempts in a row it falls back to polling
 * the JSON form for the rest of this follow. An attempt only counts as working once something
 * came through the body (an event or the heartbeat): a proxy that sends the headers but holds
 * the body back would otherwise reconnect forever. The caller decides when to stop (the run
 * is over, the screen is gone) by cancelling the collection. An error a retry cannot fix
 * (signed out, the conversation is gone, another 4xx) ends the flow with that error.
 */
class ChatEventFollower(
    private val source: ChatEventSource,
    private val wait: suspend (Long) -> Unit = { delay(it) },
    private val now: () -> Long = { Clock.System.now().toEpochMilliseconds() },
) {
    /**
     * Until when following starts out polling. A stream that failed three times in a row is
     * likely behind a proxy that holds the body back, and the next answers would each wait
     * minutes for the same three failures.
     */
    private var pollUntil = 0L

    fun follow(
        conversationId: String,
        after: () -> Int,
    ): Flow<ChatFeedItem> =
        flow {
            var failures = 0
            var reconnectMillis = DEFAULT_RECONNECT_MS
            var polling = now() < pollUntil
            var pollAfter = 0
            var catchUps = 0
            if (polling) emit(ChatFeedItem.Connection(ChatConnection.POLLING))
            while (true) {
                if (polling) {
                    val page =
                        try {
                            source.poll(conversationId, maxOf(after(), pollAfter))
                        } catch (e: CancellationException) {
                            throw e
                        } catch (e: Exception) {
                            if (e.isPermanent()) throw e
                            failures++
                            wait(e.retryAfterMillis() ?: backoffMillis(failures))
                            continue
                        }
                    failures = 0
                    page.events.forEach { emit(it.toFeedItem()) }
                    pollAfter = page.nextAfter
                    if (page.hasMore) continue
                    // The page's events were read before its lastSeq, so newer events may exist
                    // (the end of the run among them). A conversation whose newest events were
                    // pruned stays behind forever, hence the bound.
                    if (page.lastSeq > page.nextAfter && catchUps < MAX_CATCH_UPS) {
                        catchUps++
                        wait(POLL_CATCH_UP_MS)
                        continue
                    }
                    catchUps = 0
                    emit(ChatFeedItem.Polled(page.activeRun))
                    wait(if (ChatStatus.isWorking(page.activeRun?.status)) POLL_WORKING_MS else POLL_IDLE_MS)
                } else {
                    var failure: Throwable? = null
                    var bodyArrived = false
                    source
                        .stream(conversationId, after())
                        .catch { failure = it }
                        .collect { item ->
                            if (item != ChatStreamItem.Opened && !bodyArrived) {
                                bodyArrived = true
                                failures = 0
                                emit(ChatFeedItem.Connection(ChatConnection.LIVE))
                            }
                            when (item) {
                                ChatStreamItem.Opened, ChatStreamItem.Heartbeat -> {}
                                is ChatStreamItem.Retry -> reconnectMillis = item.millis
                                else -> emit(item.toFeedItem())
                            }
                        }
                    val error = failure
                    if (error == null) {
                        wait(reconnectMillis)
                        continue
                    }
                    if (error !is Exception || error is CancellationException || error.isPermanent()) throw error
                    val retryAfter = error.retryAfterMillis()
                    if (retryAfter == null) failures++
                    val pause = retryAfter ?: backoffMillis(failures)
                    if (failures >= STREAM_FAILURES_BEFORE_POLLING) {
                        polling = true
                        pollUntil = now() + POLLING_KEPT_MS
                        failures = 0
                        emit(ChatFeedItem.Connection(ChatConnection.POLLING))
                    } else {
                        emit(ChatFeedItem.Connection(ChatConnection.RECONNECTING))
                    }
                    wait(pause)
                }
            }
        }

    private fun ChatStreamItem.toFeedItem(): ChatFeedItem =
        when (this) {
            is ChatStreamItem.Event -> ChatFeedItem.Event(event)
            is ChatStreamItem.Malformed -> ChatFeedItem.Malformed(seq, cause)
            else -> error("not an event: $this")
        }

    companion object {
        const val DEFAULT_RECONNECT_MS = 3_000L
        const val MAX_BACKOFF_MS = 30_000L
        const val STREAM_FAILURES_BEFORE_POLLING = 3
        const val POLL_WORKING_MS = 1_500L
        const val POLL_IDLE_MS = 30_000L
        const val POLL_CATCH_UP_MS = 250L
        const val MAX_CATCH_UPS = 3
        const val POLLING_KEPT_MS = 10 * 60_000L

        fun backoffMillis(failures: Int): Long {
            var millis = DEFAULT_RECONNECT_MS
            repeat((failures - 1).coerceIn(0, 4)) { millis *= 2 }
            return millis.coerceAtMost(MAX_BACKOFF_MS)
        }
    }
}

/** Retrying cannot help: no session, or the server refused the request itself. */
fun Throwable.isPermanent(): Boolean =
    this is UnauthorizedException ||
        (this is ApiException && statusCode in 400..499 && statusCode != 408 && statusCode != 429)

private fun Throwable.retryAfterMillis(): Long? = (this as? ApiException)?.takeIf { it.statusCode == 429 }?.retryAfterSeconds?.times(1000)
