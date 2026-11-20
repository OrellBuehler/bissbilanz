package com.bissbilanz.repository

import com.bissbilanz.api.ChatApi
import com.bissbilanz.api.ChatEventPage
import com.bissbilanz.api.ChatStreamItem
import com.bissbilanz.api.generated.model.ChatCapability
import com.bissbilanz.api.generated.model.ChatConversationListItem
import com.bissbilanz.api.generated.model.ChatConversationsResponse
import com.bissbilanz.api.generated.model.ChatEvent
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ChatRepositoryTest {
    private var generation = 0
    private val api: ChatApi = mockk()
    private val prefsRepo: PreferencesRepository =
        mockk(relaxed = true) {
            every { accountGeneration } answers { generation }
        }
    private val repository = ChatRepository(api, prefsRepo)

    private fun item(id: String) =
        ChatConversationListItem(
            id = id,
            title = null,
            createdAt = "x",
            updatedAt = "x",
            lastMessageAt = "x",
            lastSeq = 0,
            activeRun = null,
        )

    @Test
    fun aListThatArrivesAfterASignOutIsDropped() =
        runTest {
            coEvery { api.listChatConversations(any(), any()) } answers {
                generation++
                ChatConversationsResponse(listOf(item("c1")), 1)
            }

            repository.refreshConversations()

            assertNull(repository.conversations.value)
        }

    @Test
    fun aListOfTheSameAccountIsKept() =
        runTest {
            coEvery { api.listChatConversations(any(), any()) } returns ChatConversationsResponse(listOf(item("c1")), 1)

            repository.refreshConversations()

            assertEquals(listOf("c1"), repository.conversations.value?.map { it.id })
        }

    @Test
    fun aPolledRunEndAppliesItsCapabilityForTheAccountItWasAskedFor() =
        runTest {
            val capability = ChatCapability(false, "user_budget_exhausted")
            val end = ChatEvent(seq = 3, type = "run_finished", createdAt = "x", capability = capability)
            coEvery { api.getChatEventsPage("c1", 2, any()) } returns
                ChatEventPage(listOf(ChatStreamItem.Event(end)), nextAfter = 3, lastSeq = 3, hasMore = false, activeRun = null)

            repository.pollRun("c1", 2)

            verify { prefsRepo.updateChatCapability(capability, 0) }
        }
}
