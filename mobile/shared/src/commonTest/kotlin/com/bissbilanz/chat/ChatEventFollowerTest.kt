package com.bissbilanz.chat

import com.bissbilanz.api.ApiException
import com.bissbilanz.api.ChatEventPage
import com.bissbilanz.api.ChatStreamItem
import com.bissbilanz.api.ChatStreamStalledException
import com.bissbilanz.api.UnauthorizedException
import com.bissbilanz.api.generated.model.ChatRun
import com.bissbilanz.chat.ChatFixtures.event
import com.bissbilanz.chat.ChatFixtures.run
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class ChatEventFollowerTest {
    private class FakeSource : ChatEventSource {
        val streams = ArrayDeque<Flow<ChatStreamItem>>()
        val polls = ArrayDeque<suspend () -> ChatEventPage>()
        val streamAfters = mutableListOf<Int>()
        val pollAfters = mutableListOf<Int>()

        override fun stream(
            conversationId: String,
            after: Int,
        ): Flow<ChatStreamItem> {
            streamAfters += after
            return streams.removeFirstOrNull() ?: flow { awaitCancellation() }
        }

        override suspend fun poll(
            conversationId: String,
            after: Int,
        ): ChatEventPage {
            pollAfters += after
            return (polls.removeFirstOrNull() ?: { awaitCancellation() })()
        }
    }

    private val source = FakeSource()
    private val waits = mutableListOf<Long>()
    private val follower = ChatEventFollower(source) { waits += it }
    private var lastSeq = 0

    private suspend fun follow(count: Int): List<ChatFeedItem> =
        follower
            .follow("c1") { lastSeq }
            .onEach { if (it is ChatFeedItem.Event) lastSeq = it.event.seq }
            .take(count)
            .toList()

    private fun events(vararg seqs: Int) = seqs.map { ChatStreamItem.Event(event(it, ChatEventType.TEXT_DELTA, partIndex = 0, text = "x")) }

    private fun failingStream(error: Exception = RuntimeException("connection reset")) = flow<ChatStreamItem> { throw error }

    private fun page(
        vararg seqs: Int,
        hasMore: Boolean = false,
        activeRun: ChatRun? = null,
    ) = ChatEventPage(
        events(*seqs),
        nextAfter = seqs.lastOrNull() ?: 0,
        lastSeq = seqs.lastOrNull() ?: 0,
        hasMore = hasMore,
        activeRun = activeRun,
    )

    @Test
    fun aStreamThatEndsIsReopenedAfterTheLastSeqWithTheServersRetryDelay() =
        runTest {
            source.streams +=
                flow {
                    emit(ChatStreamItem.Opened)
                    emit(ChatStreamItem.Retry(5_000))
                    events(1, 2).forEach { emit(it) }
                }
            source.streams +=
                flow {
                    emit(ChatStreamItem.Opened)
                    emit(ChatStreamItem.Heartbeat)
                }

            val items = follow(4)

            assertEquals(
                listOf(ChatConnection.LIVE, ChatConnection.LIVE),
                items.filterIsInstance<ChatFeedItem.Connection>().map { it.state },
            )
            assertEquals(listOf(1, 2), items.filterIsInstance<ChatFeedItem.Event>().map { it.event.seq })
            assertEquals(listOf(0, 2), source.streamAfters)
            assertEquals(listOf(5_000L), waits)
        }

    @Test
    fun failuresBackOffAndThenFallBackToPolling() =
        runTest {
            repeat(3) { source.streams += failingStream() }
            source.polls += { page(1, hasMore = true) }
            source.polls += { page(2, activeRun = run(ChatStatus.AWAITING_CONFIRMATION)) }

            val items = follow(6)

            assertEquals(
                listOf(
                    ChatFeedItem.Connection(ChatConnection.RECONNECTING),
                    ChatFeedItem.Connection(ChatConnection.RECONNECTING),
                    ChatFeedItem.Connection(ChatConnection.POLLING),
                ),
                items.take(3),
            )
            assertEquals(listOf(1, 2), items.filterIsInstance<ChatFeedItem.Event>().map { it.event.seq })
            assertEquals(ChatStatus.AWAITING_CONFIRMATION, (items.last() as ChatFeedItem.Polled).activeRun?.status)
            assertEquals(listOf(3_000L, 6_000L, 12_000L), waits)
            assertEquals(listOf(0, 1), source.pollAfters)
        }

    @Test
    fun pollingWaitsLongerWhileTheRunWaitsForTheUser() =
        runTest {
            repeat(3) { source.streams += failingStream() }
            source.polls += { page(1, activeRun = run(ChatStatus.RUNNING)) }
            source.polls += { page(activeRun = run(ChatStatus.AWAITING_CONFIRMATION)) }
            source.polls += { page() }

            follow(7)

            assertEquals(listOf(ChatEventFollower.POLL_WORKING_MS, ChatEventFollower.POLL_IDLE_MS), waits.drop(3))
        }

    @Test
    fun aStreamWhoseBodyCameThroughResetsTheFailureCount() =
        runTest {
            repeat(4) {
                source.streams +=
                    flow {
                        emit(ChatStreamItem.Opened)
                        emit(ChatStreamItem.Heartbeat)
                        throw RuntimeException("dropped")
                    }
            }

            val items = follow(8)

            assertTrue(items.none { it == ChatFeedItem.Connection(ChatConnection.POLLING) })
            assertEquals(List(3) { 3_000L }, waits)
        }

    @Test
    fun headersWithoutABodyCountAsFailuresAndEndInPolling() =
        runTest {
            repeat(3) {
                source.streams +=
                    flow {
                        emit(ChatStreamItem.Opened)
                        throw ChatStreamStalledException(45_000)
                    }
            }
            source.polls += { page(1) }

            val items = follow(5)

            assertEquals(ChatFeedItem.Connection(ChatConnection.POLLING), items[2])
            assertTrue(items.none { it == ChatFeedItem.Connection(ChatConnection.LIVE) })
            assertEquals(listOf(3_000L, 6_000L, 12_000L), waits)
        }

    @Test
    fun aPollThatSawNewerEventsThanItReturnedAsksAgainAtOnce() =
        runTest {
            repeat(3) { source.streams += failingStream() }
            source.polls += {
                ChatEventPage(events(1), nextAfter = 1, lastSeq = 3, hasMore = false, activeRun = null)
            }
            source.polls += { page(2, 3) }

            val items = follow(7)

            assertEquals(listOf(1, 2, 3), items.filterIsInstance<ChatFeedItem.Event>().map { it.event.seq })
            assertEquals(ChatFeedItem.Polled(null), items.last())
            assertEquals(1, items.count { it is ChatFeedItem.Polled })
            assertEquals(ChatEventFollower.POLL_CATCH_UP_MS, waits[3])
            assertEquals(listOf(0, 1), source.pollAfters)
        }

    @Test
    fun aPollThatStaysBehindIsNotRepeatedForever() =
        runTest {
            repeat(3) { source.streams += failingStream() }
            repeat(4) { source.polls += { ChatEventPage(emptyList(), nextAfter = 5, lastSeq = 9, hasMore = false, activeRun = null) } }

            val items = follow(4)

            assertEquals(ChatFeedItem.Polled(null), items.last())
            assertEquals(List(ChatEventFollower.MAX_CATCH_UPS) { ChatEventFollower.POLL_CATCH_UP_MS }, waits.drop(3))
        }

    @Test
    fun aRateLimitWaitsForRetryAfterWithoutCountingAsAFailure() =
        runTest {
            repeat(3) { source.streams += failingStream(ApiException("busy", 429, retryAfterSeconds = 7)) }
            source.streams +=
                flow {
                    emit(ChatStreamItem.Opened)
                    emit(ChatStreamItem.Heartbeat)
                }

            val items = follow(4)

            assertEquals(ChatFeedItem.Connection(ChatConnection.LIVE), items.last())
            assertEquals(List(3) { 7_000L }, waits)
        }

    @Test
    fun anEventThatDidNotDecodeIsPassedOnAndTheStreamGoesOn() =
        runTest {
            val bad = IllegalArgumentException("bad json")
            source.streams +=
                flow {
                    emit(ChatStreamItem.Opened)
                    emit(ChatStreamItem.Malformed(1, bad))
                    events(2).forEach { emit(it) }
                }

            val items = follow(3)

            assertEquals(ChatFeedItem.Malformed(1, bad), items[1])
            assertEquals(2, (items[2] as ChatFeedItem.Event).event.seq)
        }

    @Test
    fun aGoneConversationOrALostSessionEndsFollowing() =
        runTest {
            source.streams += failingStream(ApiException("gone", 404))
            assertFailsWith<ApiException> { follow(1) }

            source.streams += failingStream(UnauthorizedException())
            assertFailsWith<UnauthorizedException> { follow(1) }
            assertEquals(emptyList(), waits)
        }

    @Test
    fun theBackoffDoublesUpToThirtySeconds() {
        assertEquals(listOf(3_000L, 6_000L, 12_000L, 24_000L, 30_000L, 30_000L), (1..6).map { ChatEventFollower.backoffMillis(it) })
    }
}
