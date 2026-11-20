package com.bissbilanz.android.ui.viewmodels

import androidx.lifecycle.SavedStateHandle
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.R
import com.bissbilanz.android.chat.ChatDataRefresher
import com.bissbilanz.android.chat.ViewedDiaryDay
import com.bissbilanz.android.ui.viewmodels.ChatTestFixtures.accepted
import com.bissbilanz.android.ui.viewmodels.ChatTestFixtures.action
import com.bissbilanz.android.ui.viewmodels.ChatTestFixtures.actionPart
import com.bissbilanz.android.ui.viewmodels.ChatTestFixtures.detail
import com.bissbilanz.android.ui.viewmodels.ChatTestFixtures.event
import com.bissbilanz.android.ui.viewmodels.ChatTestFixtures.listItem
import com.bissbilanz.android.ui.viewmodels.ChatTestFixtures.message
import com.bissbilanz.android.ui.viewmodels.ChatTestFixtures.run
import com.bissbilanz.android.ui.viewmodels.ChatTestFixtures.text
import com.bissbilanz.api.ApiException
import com.bissbilanz.api.generated.model.ChatActionDecisionResponse
import com.bissbilanz.api.generated.model.ChatCapability
import com.bissbilanz.api.generated.model.ChatChange
import com.bissbilanz.api.generated.model.ChatConversationListItem
import com.bissbilanz.api.generated.model.ChatMessageCreate
import com.bissbilanz.api.generated.model.ChatMessagePart
import com.bissbilanz.chat.ChatChangeScope
import com.bissbilanz.chat.ChatDomain
import com.bissbilanz.chat.ChatFeedItem
import com.bissbilanz.chat.ChatRefreshPlan
import com.bissbilanz.chat.ChatSendProblem
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.repository.AiTaskRepository
import com.bissbilanz.repository.ChatRepository
import com.bissbilanz.repository.PreferencesRepository
import com.bissbilanz.sync.ConnectivityProvider
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.coVerifyOrder
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class ChatViewModelTest {
    private val testDispatcher = UnconfinedTestDispatcher()
    private val conversations = MutableStateFlow<List<ChatConversationListItem>?>(null)
    private val capability = MutableStateFlow<ChatCapability?>(null)
    private val online = MutableStateFlow(true)
    private val feed = Channel<ChatFeedItem>(Channel.UNLIMITED)
    private val followedFrom = mutableListOf<Int>()
    private val sent = mutableListOf<ChatMessageCreate>()
    private lateinit var chatRepo: ChatRepository
    private lateinit var refresher: ChatDataRefresher
    private lateinit var errorReporter: ErrorReporter
    private lateinit var viewModel: ChatViewModel
    private val viewedDay = ViewedDiaryDay()
    private val entries = listOf(ChatChange(domain = ChatDomain.ENTRIES, dates = listOf("2026-11-18")))

    @BeforeTest
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        chatRepo =
            mockk(relaxed = true) {
                every { conversations } returns this@ChatViewModelTest.conversations
                every { follow(any(), any()) } answers {
                    followedFrom += secondArg<() -> Int>().invoke()
                    feed.receiveAsFlow()
                }
            }
        coEvery { chatRepo.refreshConversations() } answers { if (conversations.value == null) conversations.value = emptyList() }
        coEvery { chatRepo.send(any(), any()) } answers {
            val request = secondArg<ChatMessageCreate>()
            sent += request
            accepted(firstArg(), request)
        }
        refresher = mockk(relaxed = true)
        errorReporter = mockk(relaxed = true)
        val prefsRepo: PreferencesRepository = mockk { every { chatCapability } returns capability }
        val connectivity: ConnectivityProvider = mockk { every { isOnline } returns online }
        val appModeManager: AppModeManager = mockk { every { isLocal } returns false }
        val aiTaskRepo: AiTaskRepository = mockk(relaxed = true)
        coEvery { aiTaskRepo.uploadPhotos(any()) } returns listOf("/uploads/p1.webp")
        viewModel =
            ChatViewModel(
                chatRepo,
                prefsRepo,
                aiTaskRepo,
                refresher,
                viewedDay,
                connectivity,
                appModeManager,
                errorReporter,
                SavedStateHandle(),
            )
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private var visibleJob: Job? = null

    private fun TestScope.visible() {
        visibleJob = backgroundScope.launch(testDispatcher) { viewModel.whileVisible() }
    }

    private fun TestScope.stopped() {
        visibleJob?.cancel()
        runCurrent()
    }

    private fun TestScope.collectMessages(): MutableList<Int> {
        val messages = mutableListOf<Int>()
        backgroundScope.launch(testDispatcher) { viewModel.messages.collect { messages += it } }
        return messages
    }

    private fun TestScope.emit(item: ChatFeedItem) {
        feed.trySend(item)
        runCurrent()
    }

    private fun TestScope.openWithPendingAction(): String {
        val id = "c1"
        conversations.value = listOf(listItem(id))
        val pending = action(id)
        coEvery { chatRepo.conversation(id) } returns
            detail(
                id,
                listOf(
                    message(
                        ChatTestFixtures.ASSISTANT,
                        id,
                        "assistant",
                        listOf(text("Delete it?"), actionPart(pending)),
                        status = "in_progress",
                    ),
                ),
                lastSeq = 6,
                activeRun = run("awaiting_confirmation", id),
            )
        visible()
        viewModel.open(id)
        runCurrent()
        return id
    }

    @Test
    fun withoutAnyChatTheScreenOpensANewOne() =
        runTest {
            visible()

            val state = viewModel.state.value
            assertTrue(state.isNew)
            assertEquals(state.openId, state.thread?.conversationId)
        }

    @Test
    fun aMessageIsSentAfterTheQueueIsFlushedAndTheAnswerIsFollowedToItsEnd() =
        runTest {
            visible()
            val id = viewModel.state.value.openId!!
            viewedDay.viewing("2026-11-18")
            viewModel.clientLocale = "de"

            viewModel.updateDraft("Log 150 g yogurt")
            viewModel.send()

            coVerifyOrder {
                refresher.flushLocalChanges()
                chatRepo.createConversation(id)
                chatRepo.send(id, any())
            }
            val request = sent.single()
            assertEquals("Log 150 g yogurt", request.text)
            assertEquals("2026-11-18", request.context?.date)
            assertEquals("de", request.context?.locale)
            val state = viewModel.state.value
            assertFalse(state.isNew)
            assertEquals(emptyList(), state.outbox)
            assertEquals(listOf(request.id), state.thread?.messages?.map { it.id })
            assertEquals("", viewModel.draft.value)
            assertEquals(listOf(0), followedFrom)

            emit(ChatFeedItem.Event(event(2, "run_started", run = run("running", id))))
            emit(ChatFeedItem.Event(event(3, "text_delta", partIndex = 0, text = "Logged.")))
            emit(ChatFeedItem.Event(event(4, "tool_finished", partIndex = 1, status = "ok", changes = entries)))
            verify(exactly = 1) {
                refresher.request(ChatRefreshPlan(mapOf(ChatDomain.ENTRIES to ChatChangeScope(dates = setOf("2026-11-18")))), "2026-11-18")
            }

            val goals = ChatChange(domain = ChatDomain.GOALS)
            emit(
                ChatFeedItem.Event(
                    event(
                        5,
                        "run_finished",
                        status = "completed",
                        run = run("completed", id),
                        changes = entries + goals,
                        capability = ChatCapability(false, "user_budget_exhausted"),
                    ),
                ),
            )

            verify(exactly = 1) { refresher.request(ChatRefreshPlan(mapOf(ChatDomain.GOALS to ChatChangeScope.EVERYTHING)), "2026-11-18") }
            verify { chatRepo.updateCapability(ChatCapability(false, "user_budget_exhausted")) }
            assertNull(
                viewModel.state.value.thread
                    ?.activeRun,
            )
            assertEquals(
                "Logged.",
                viewModel.state.value.thread
                    ?.messages
                    ?.last()
                    ?.parts
                    ?.first()
                    ?.text,
            )
            verify(exactly = 1) { chatRepo.follow(id, any()) }
        }

    @Test
    fun aFailedSendStaysInTheChatAndARetryReusesItsId() =
        runTest {
            visible()
            coEvery { chatRepo.send(any(), any()) } answers {
                sent += secondArg<ChatMessageCreate>()
                throw ApiException("down", 503)
            }
            viewModel.updateDraft("Hello")
            viewModel.send()

            val failed =
                viewModel.state.value.outbox
                    .single()
            assertEquals(ChatSendProblem.NETWORK, failed.problem)
            assertFalse(failed.sending)

            coEvery { chatRepo.send(any(), any()) } answers {
                val request = secondArg<ChatMessageCreate>()
                sent += request
                accepted(firstArg(), request)
            }
            viewModel.retry(failed.id)

            assertEquals(2, sent.size)
            assertEquals(sent[0].id, sent[1].id)
            assertEquals(emptyList(), viewModel.state.value.outbox)
        }

    @Test
    fun anIdTakenElsewhereIsReplacedByAFreshOne() =
        runTest {
            visible()
            var first = true
            coEvery { chatRepo.send(any(), any()) } answers {
                val request = secondArg<ChatMessageCreate>()
                sent += request
                if (first) {
                    first = false
                    throw ApiException("conflict", 409, responseBody = """{"error":"Conflict","code":"message_id_conflict"}""")
                }
                accepted(firstArg(), request)
            }

            viewModel.updateDraft("Hello")
            viewModel.send()

            assertEquals(2, sent.size)
            assertNotEquals(sent[0].id, sent[1].id)
            assertEquals(emptyList(), viewModel.state.value.outbox)
        }

    @Test
    fun aBudgetRefusalShowsItsProblemAndPhotosAreUploadedOnlyOnce() =
        runTest {
            visible()
            coEvery { chatRepo.send(any(), any()) } answers {
                sent += secondArg<ChatMessageCreate>()
                throw ApiException(
                    "budget",
                    403,
                    responseBody = """{"error":"x","code":"budget_exhausted","capability":{"available":false}}""",
                )
            }
            viewModel.attach(listOf(byteArrayOf(1, 2)))
            viewModel.updateDraft("What is this?")
            viewModel.send()
            val failed =
                viewModel.state.value.outbox
                    .single()
            viewModel.retry(failed.id)

            assertEquals(
                ChatSendProblem.BUDGET_EXHAUSTED,
                viewModel.state.value.outbox
                    .single()
                    .problem,
            )
            assertEquals(listOf("/uploads/p1.webp"), sent.last().imageFilenames)
            coVerify(exactly = 1) { chatRepo.createConversation(any()) }
        }

    @Test
    fun offlineNothingIsSentAndTheDraftStays() =
        runTest {
            val messages = collectMessages()
            visible()
            online.value = false

            viewModel.updateDraft("Hello")
            viewModel.send()

            assertEquals(emptyList(), viewModel.state.value.outbox)
            assertEquals("Hello", viewModel.draft.value)
            assertEquals(listOf(R.string.chat_send_offline), messages)
            coVerify(exactly = 0) { chatRepo.send(any(), any()) }
        }

    @Test
    fun nothingCanBeSentWhileChatIsClosed() =
        runTest {
            visible()
            capability.value = ChatCapability(false, "no_access")

            viewModel.updateDraft("Hello")
            viewModel.send()

            assertFalse(viewModel.canSend("Hello"))
            coVerify(exactly = 0) { chatRepo.send(any(), any()) }
        }

    @Test
    fun approvingResumesTheRun() =
        runTest {
            val id = openWithPendingAction()
            coEvery { chatRepo.decide("a1", true) } returns ChatActionDecisionResponse(action(id, "approved"), run("queued", id))

            viewModel.approve("a1")

            val thread = viewModel.state.value.thread!!
            assertEquals(
                "approved",
                thread.messages
                    .last()
                    .parts[1]
                    .status,
            )
            assertEquals("queued", thread.activeRun?.status)
            assertEquals(emptySet(), viewModel.state.value.deciding)
        }

    @Test
    fun rejectingSendsTheRejection() =
        runTest {
            val id = openWithPendingAction()
            coEvery { chatRepo.decide("a1", false) } returns ChatActionDecisionResponse(action(id, "rejected"), run("queued", id))

            viewModel.reject("a1")

            coVerify { chatRepo.decide("a1", false) }
            assertEquals(
                "rejected",
                viewModel.state.value.thread!!
                    .messages
                    .last()
                    .parts[1]
                    .status,
            )
        }

    @Test
    fun anExpiredConfirmationShowsAsExpiredAndTheChatIsReloaded() =
        runTest {
            val messages = collectMessages()
            val id = openWithPendingAction()
            val expired = action(id, "expired")
            coEvery { chatRepo.decide("a1", true) } throws
                ApiException(
                    "expired",
                    409,
                    responseBody = """{"error":"x","code":"action_expired","action":${actionJson(id)}}""",
                )
            coEvery { chatRepo.conversation(id) } returns
                detail(
                    id,
                    listOf(message(ChatTestFixtures.ASSISTANT, id, "assistant", listOf(text("Delete it?"), actionPart(expired)))),
                    lastSeq = 9,
                )

            viewModel.approve("a1")

            assertEquals(listOf(R.string.chat_action_expired), messages)
            assertEquals(
                "expired",
                viewModel.state.value.thread!!
                    .messages
                    .last()
                    .parts[1]
                    .status,
            )
            assertNull(
                viewModel.state.value.thread!!
                    .activeRun,
            )
            coVerify(exactly = 2) { chatRepo.conversation(id) }
        }

    private fun actionJson(id: String) =
        """{"id":"a1","conversationId":"$id","runId":"r1","messageId":"m-assistant","toolUseId":"toolu_2","name":"delete_entry",
           "label":"Deleting an entry","status":"expired","preview":{"summary":"Delete yogurt","details":[]},
           "expiresAt":"2026-11-19T21:56:15.139Z","decidedAt":null,"createdAt":"2026-11-19T20:56:14.871Z"}"""

    @Test
    fun stoppingCancelsTheRunAndKeepsFollowingUntilItEnds() =
        runTest {
            val id = openWithPendingAction()
            emit(ChatFeedItem.Event(event(7, "run_resumed", run = run("running", id))))

            viewModel.stop()

            coVerify { chatRepo.cancel(ChatTestFixtures.RUN) }
            assertTrue(viewModel.state.value.stopping)
            emit(ChatFeedItem.Event(event(8, "run_finished", status = "cancelled", run = run("cancelled", id))))
            assertFalse(viewModel.state.value.stopping)
            assertNull(
                viewModel.state.value.thread
                    ?.activeRun,
            )
        }

    @Test
    fun aConversationWithoutARunIsNotFollowed() =
        runTest {
            conversations.value = listOf(listItem("c2"))
            coEvery { chatRepo.conversation("c2") } returns detail("c2", emptyList(), lastSeq = 4)
            visible()

            viewModel.open("c2")
            runCurrent()

            coVerify { chatRepo.conversation("c2") }
            verify(exactly = 0) { chatRepo.follow(any(), any()) }
        }

    @Test
    fun aStartAfterAStopReloadsAndFollowsOnFromTheLastSeq() =
        runTest {
            val id = openWithPendingAction()
            assertEquals(listOf(6), followedFrom)
            emit(ChatFeedItem.Event(event(7, "run_resumed", run = run("running", id))))

            stopped()
            val inProgress =
                message(
                    ChatTestFixtures.ASSISTANT,
                    id,
                    "assistant",
                    listOf(text("Delete it?"), actionPart(action(id, "approved"))),
                    status = "in_progress",
                )
            coEvery { chatRepo.conversation(id) } returns detail(id, listOf(inProgress), lastSeq = 7, activeRun = run("running", id))
            visible()
            runCurrent()

            coVerify(exactly = 2) { chatRepo.conversation(id) }
            assertEquals(listOf(6, 7), followedFrom)
        }

    @Test
    fun aRunThatEndedWhileTheScreenWasStoppedStillRefreshesWhatItChanged() =
        runTest {
            val id = openWithPendingAction()
            stopped()
            val finished =
                message(
                    ChatTestFixtures.ASSISTANT,
                    id,
                    "assistant",
                    listOf(
                        text("Deleted."),
                        ChatMessagePart(type = "tool", status = "ok", changed = listOf(ChatDomain.ENTRIES), changes = entries),
                    ),
                )
            coEvery { chatRepo.conversation(id) } returns detail(id, listOf(finished), lastSeq = 12)

            visible()
            runCurrent()

            verify { refresher.request(ChatRefreshPlan(mapOf(ChatDomain.ENTRIES to ChatChangeScope(dates = setOf("2026-11-18")))), null) }
            assertNull(
                viewModel.state.value.thread
                    ?.activeRun,
            )
        }

    @Test
    fun anEventThatDoesNotDecodeIsReportedSkippedAndTheChatReloaded() =
        runTest {
            val id = openWithPendingAction()
            val bad = IllegalArgumentException("bad event")

            emit(ChatFeedItem.Malformed(7, bad))

            verify { errorReporter.captureException(bad) }
            coVerify(exactly = 2) { chatRepo.conversation(id) }
        }

    @Test
    fun aDeletedConversationClosesWithAMessage() =
        runTest {
            val messages = collectMessages()
            conversations.value = listOf(listItem("c3"))
            coEvery { chatRepo.conversation("c3") } throws ApiException("gone", 404)
            visible()

            viewModel.open("c3")
            runCurrent()

            assertNull(viewModel.state.value.openId)
            assertEquals(listOf(R.string.chat_conversation_gone), messages)
        }

    @Test
    fun photosAreLimitedPerMessage() =
        runTest {
            visible()

            viewModel.attach(List(7) { byteArrayOf(it.toByte()) })

            assertEquals(ChatViewModel.MAX_PHOTOS_PER_MESSAGE, viewModel.attachments.value.size)
            assertEquals(0, viewModel.photoRoom.value)
        }

    @Test
    fun discardingAFailedMessagePutsItsTextBack() =
        runTest {
            visible()
            coEvery { chatRepo.send(any(), any()) } throws
                ApiException("too long", 409, responseBody = """{"error":"x","code":"conversation_too_long"}""")
            viewModel.updateDraft("One more")
            viewModel.send()
            val failed =
                viewModel.state.value.outbox
                    .single()
            assertEquals(ChatSendProblem.CONVERSATION_TOO_LONG, failed.problem)

            viewModel.discard(failed.id)

            assertEquals(emptyList(), viewModel.state.value.outbox)
            assertEquals("One more", viewModel.draft.value)
        }
}
