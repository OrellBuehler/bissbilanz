package com.bissbilanz.android.navigation

import com.bissbilanz.api.generated.model.AiTask
import com.bissbilanz.api.generated.model.AiTaskClaudeThread
import com.bissbilanz.api.generated.model.AiTaskThreadMessage
import com.bissbilanz.util.withRepliesRead
import kotlin.test.Test
import kotlin.test.assertEquals

class AiTaskAttentionCountTest {
    private fun message(
        id: String,
        role: String = "assistant",
        unread: Boolean,
    ) = AiTaskThreadMessage(
        id = id,
        role = role,
        text = "text of $id",
        outcome = if (role == "user") null else "answered",
        createdAt = "2026-10-12T10:00:00Z",
        unread = unread,
    )

    private fun task(
        id: String,
        status: AiTask.Status,
        acknowledgedAt: String? = null,
        messages: List<AiTaskThreadMessage> = emptyList(),
    ) = AiTask(
        id = id,
        userId = "u1",
        status = status,
        description = "2 eggs",
        photoUrl = null,
        photoUrls = emptyList(),
        date = "2026-10-12",
        mealType = "Breakfast",
        eatenAt = null,
        source = "android",
        resultSummary = null,
        createdEntryIds = emptyList(),
        completedAt = null,
        dismissedAt = null,
        acknowledgedAt = acknowledgedAt,
        processedBy = AiTask.ProcessedBy.assistant,
        processedByKind = "claude",
        claudeThread =
            AiTaskClaudeThread(
                messages = messages,
                correctionState = "idle",
                canReply = true,
                replyBlockedReason = null,
                repliesRemaining = 5,
                unreadReplies = messages.count { it.unread },
            ),
    )

    @Test
    fun countsUnreadDismissalsAndUnreadAssistantReplies() {
        val tasks =
            listOf(
                task("dismissed", AiTask.Status.dismissed),
                task(
                    "answered",
                    AiTask.Status.completed,
                    messages =
                        listOf(
                            message("q", role = "user", unread = false),
                            message("a1", unread = true),
                            message("a2", unread = true),
                        ),
                ),
                task("open", AiTask.Status.pending),
            )

        assertEquals(3, aiTaskAttentionCount(tasks))
    }

    @Test
    fun theBadgeClearsOnceTheListIsAcknowledgedAndTheRepliesRead() {
        val tasks =
            listOf(
                task("dismissed", AiTask.Status.dismissed, acknowledgedAt = "2026-10-12T11:00:00Z"),
                task("answered", AiTask.Status.completed, messages = listOf(message("a1", unread = true)))
                    .withRepliesRead(setOf("a1")),
            )

        assertEquals(0, aiTaskAttentionCount(tasks))
    }

    @Test
    fun nothingToAttendToShowsNoBadge() {
        assertEquals(0, aiTaskAttentionCount(emptyList()))
    }
}
