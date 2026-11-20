package com.bissbilanz.chat

import com.bissbilanz.api.ApiException
import com.bissbilanz.api.UnauthorizedException
import com.bissbilanz.api.chatError
import com.bissbilanz.api.generated.model.ChatCapability

/** Why a message could not be sent (`docs/ai-chat.md` §4), as the client tells the user. */
enum class ChatSendProblem {
    OFFLINE,
    NETWORK,
    SIGNED_OUT,
    UNAVAILABLE,
    BUDGET_EXHAUSTED,
    DAILY_LIMIT,
    RATE_LIMITED,
    CONVERSATION_TOO_LONG,
    RUN_ACTIVE,
    MESSAGE_ID_CONFLICT,
    INVALID_IMAGE,
    INVALID,
    CONVERSATION_GONE,
    UNKNOWN,
}

/** Why chat is closed for now, from a capability's `blockedReason`. */
enum class ChatBlock {
    NOT_CONFIGURED,
    DISABLED,
    NO_ACCESS,
    USER_BUDGET,
    GLOBAL_BUDGET,
    OTHER,
}

/** The hint a finished answer gets (`docs/ai-chat.md` §8); none for a plain completion or a superseded run. */
enum class ChatRunOutcome {
    CUT_OFF,
    STEP_LIMIT,
    INCOMPLETE,
    UNAVAILABLE,
    BUDGET_EXHAUSTED,
    REFUSAL,
    CONVERSATION_TOO_LONG,
    ERROR,
    STOPPED,
    CONFIRMATION_EXPIRED,
    INTERRUPTED,
}

object ChatProblems {
    fun sendProblem(error: Throwable): ChatSendProblem {
        if (error is UnauthorizedException) return ChatSendProblem.SIGNED_OUT
        val api = error as? ApiException ?: return ChatSendProblem.NETWORK
        val code = api.chatError()?.code
        return when (api.statusCode) {
            401 -> ChatSendProblem.SIGNED_OUT
            400 -> if (code == "invalid_image") ChatSendProblem.INVALID_IMAGE else ChatSendProblem.INVALID
            403 ->
                when (code) {
                    "budget_exhausted" -> ChatSendProblem.BUDGET_EXHAUSTED
                    else -> ChatSendProblem.UNAVAILABLE
                }
            404 -> ChatSendProblem.CONVERSATION_GONE
            409 ->
                when (code) {
                    "run_active" -> ChatSendProblem.RUN_ACTIVE
                    "conversation_too_long" -> ChatSendProblem.CONVERSATION_TOO_LONG
                    "message_id_conflict" -> ChatSendProblem.MESSAGE_ID_CONFLICT
                    else -> ChatSendProblem.UNKNOWN
                }
            429 -> if (code == "daily_limit_reached") ChatSendProblem.DAILY_LIMIT else ChatSendProblem.RATE_LIMITED
            in 500..599, 408 -> ChatSendProblem.NETWORK
            else -> ChatSendProblem.UNKNOWN
        }
    }

    /** Null while chat is open, or while nothing is known (offline, an older server). */
    fun block(capability: ChatCapability?): ChatBlock? {
        if (capability == null || capability.available) return null
        return when (capability.blockedReason) {
            "not_configured" -> ChatBlock.NOT_CONFIGURED
            "disabled" -> ChatBlock.DISABLED
            "no_access" -> ChatBlock.NO_ACCESS
            "user_budget_exhausted" -> ChatBlock.USER_BUDGET
            "global_budget_exhausted" -> ChatBlock.GLOBAL_BUDGET
            else -> ChatBlock.OTHER
        }
    }

    fun runOutcome(
        status: String,
        reason: String?,
    ): ChatRunOutcome? =
        when (status) {
            ChatStatus.IN_PROGRESS -> null
            ChatStatus.COMPLETED ->
                when (reason) {
                    null -> null
                    "output_limit" -> ChatRunOutcome.CUT_OFF
                    "iteration_limit" -> ChatRunOutcome.STEP_LIMIT
                    else -> ChatRunOutcome.INCOMPLETE
                }
            ChatStatus.FAILED ->
                when (reason) {
                    "not_configured", "disabled", "no_access" -> ChatRunOutcome.UNAVAILABLE
                    "user_budget_exhausted", "global_budget_exhausted" -> ChatRunOutcome.BUDGET_EXHAUSTED
                    "refusal" -> ChatRunOutcome.REFUSAL
                    "conversation_too_long" -> ChatRunOutcome.CONVERSATION_TOO_LONG
                    else -> ChatRunOutcome.ERROR
                }
            ChatStatus.CANCELLED ->
                when (reason) {
                    "superseded" -> null
                    "action_expired" -> ChatRunOutcome.CONFIRMATION_EXPIRED
                    else -> ChatRunOutcome.STOPPED
                }
            else -> ChatRunOutcome.INTERRUPTED
        }
}
