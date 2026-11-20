package com.bissbilanz.chat

import com.bissbilanz.api.ApiException
import com.bissbilanz.api.UnauthorizedException
import com.bissbilanz.api.generated.model.ChatCapability
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ChatProblemsTest {
    private fun failure(
        status: Int,
        code: String? = null,
    ) = ApiException(
        "HTTP $status",
        status,
        responseBody = code?.let { """{"error":"Refused","code":"$it","capability":{"available":false}}""" } ?: """{"error":"Refused"}""",
    )

    @Test
    fun everyDocumentedSendErrorHasItsOwnProblem() {
        val cases =
            mapOf(
                failure(400) to ChatSendProblem.INVALID,
                failure(400, "invalid_image") to ChatSendProblem.INVALID_IMAGE,
                failure(403) to ChatSendProblem.UNAVAILABLE,
                failure(403, "chat_unavailable") to ChatSendProblem.UNAVAILABLE,
                failure(403, "budget_exhausted") to ChatSendProblem.BUDGET_EXHAUSTED,
                failure(404, "conversation_not_found") to ChatSendProblem.CONVERSATION_GONE,
                failure(409, "run_active") to ChatSendProblem.RUN_ACTIVE,
                failure(409, "conversation_too_long") to ChatSendProblem.CONVERSATION_TOO_LONG,
                failure(409, "message_id_conflict") to ChatSendProblem.MESSAGE_ID_CONFLICT,
                failure(429, "daily_limit_reached") to ChatSendProblem.DAILY_LIMIT,
                failure(429) to ChatSendProblem.RATE_LIMITED,
                failure(503) to ChatSendProblem.NETWORK,
                failure(409, "something_new") to ChatSendProblem.UNKNOWN,
                failure(418) to ChatSendProblem.UNKNOWN,
            )

        cases.forEach { (error, problem) -> assertEquals(problem, ChatProblems.sendProblem(error), error.message) }
    }

    @Test
    fun noResponseIsANetworkProblemAndAFailedRefreshIsASignOut() {
        assertEquals(ChatSendProblem.NETWORK, ChatProblems.sendProblem(RuntimeException("timeout")))
        assertEquals(ChatSendProblem.SIGNED_OUT, ChatProblems.sendProblem(UnauthorizedException()))
        assertEquals(ChatSendProblem.SIGNED_OUT, ChatProblems.sendProblem(failure(401)))
    }

    @Test
    fun aBodyThatIsNotJsonStillMapsByStatus() {
        assertEquals(ChatSendProblem.RATE_LIMITED, ChatProblems.sendProblem(ApiException("x", 429, responseBody = "<html>")))
    }

    @Test
    fun blockedReasonsMapAndUnknownOnesAreStillBlocked() {
        assertNull(ChatProblems.block(null))
        assertNull(ChatProblems.block(ChatCapability(available = true, remainingBudgetUsd = 1.0)))
        assertEquals(ChatBlock.USER_BUDGET, ChatProblems.block(ChatCapability(false, "user_budget_exhausted")))
        assertEquals(ChatBlock.GLOBAL_BUDGET, ChatProblems.block(ChatCapability(false, "global_budget_exhausted")))
        assertEquals(ChatBlock.NO_ACCESS, ChatProblems.block(ChatCapability(false, "no_access")))
        assertEquals(ChatBlock.DISABLED, ChatProblems.block(ChatCapability(false, "disabled")))
        assertEquals(ChatBlock.NOT_CONFIGURED, ChatProblems.block(ChatCapability(false, "not_configured")))
        assertEquals(ChatBlock.OTHER, ChatProblems.block(ChatCapability(false, "maintenance")))
        assertEquals(ChatBlock.OTHER, ChatProblems.block(ChatCapability(false)))
    }

    @Test
    fun runOutcomesFollowTheDocumentedTable() {
        val cases =
            listOf(
                Triple(ChatStatus.COMPLETED, null, null),
                Triple(ChatStatus.COMPLETED, "output_limit", ChatRunOutcome.CUT_OFF),
                Triple(ChatStatus.COMPLETED, "iteration_limit", ChatRunOutcome.STEP_LIMIT),
                Triple(ChatStatus.COMPLETED, "new_reason", ChatRunOutcome.INCOMPLETE),
                Triple(ChatStatus.FAILED, "no_access", ChatRunOutcome.UNAVAILABLE),
                Triple(ChatStatus.FAILED, "global_budget_exhausted", ChatRunOutcome.BUDGET_EXHAUSTED),
                Triple(ChatStatus.FAILED, "refusal", ChatRunOutcome.REFUSAL),
                Triple(ChatStatus.FAILED, "conversation_too_long", ChatRunOutcome.CONVERSATION_TOO_LONG),
                Triple(ChatStatus.FAILED, "api_error", ChatRunOutcome.ERROR),
                Triple(ChatStatus.FAILED, "new_reason", ChatRunOutcome.ERROR),
                Triple(ChatStatus.CANCELLED, "user_cancelled", ChatRunOutcome.STOPPED),
                Triple(ChatStatus.CANCELLED, "superseded", null),
                Triple(ChatStatus.CANCELLED, "action_expired", ChatRunOutcome.CONFIRMATION_EXPIRED),
                Triple(ChatStatus.INTERRUPTED, "server_restart", ChatRunOutcome.INTERRUPTED),
                Triple("some_future_status", null, ChatRunOutcome.INTERRUPTED),
                Triple(ChatStatus.IN_PROGRESS, null, null),
            )

        cases.forEach { (status, reason, outcome) -> assertEquals(outcome, ChatProblems.runOutcome(status, reason), "$status/$reason") }
    }
}
