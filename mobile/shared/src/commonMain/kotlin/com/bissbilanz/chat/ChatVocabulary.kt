package com.bissbilanz.chat

/**
 * The open string vocabularies of `docs/ai-chat.md`. They are compared as plain strings, never
 * decoded into enums: the server may add values, and every check here has a fallback for them.
 */
object ChatEventType {
    const val MESSAGE_CREATED = "message_created"
    const val RUN_STARTED = "run_started"
    const val RUN_RESUMED = "run_resumed"
    const val TEXT_DELTA = "text_delta"
    const val TOOL_STARTED = "tool_started"
    const val TOOL_FINISHED = "tool_finished"
    const val ACTION_REQUIRED = "action_required"
    const val ACTION_RESOLVED = "action_resolved"
    const val MESSAGE_COMPLETED = "message_completed"
    const val RUN_FINISHED = "run_finished"
    const val ERROR = "error"
}

object ChatPartType {
    const val TEXT = "text"
    const val IMAGE = "image"
    const val TOOL = "tool"
    const val ACTION = "action"

    /** Stands in for a part whose event never arrived; renders as nothing, like an unknown type. */
    const val GAP = "gap"
}

object ChatRole {
    const val USER = "user"
    const val ASSISTANT = "assistant"
}

object ChatStatus {
    const val QUEUED = "queued"
    const val RUNNING = "running"
    const val AWAITING_CONFIRMATION = "awaiting_confirmation"
    const val IN_PROGRESS = "in_progress"
    const val COMPLETED = "completed"
    const val FAILED = "failed"
    const val CANCELLED = "cancelled"
    const val INTERRUPTED = "interrupted"

    const val TOOL_RUNNING = "running"
    const val TOOL_OK = "ok"
    const val TOOL_ERROR = "error"

    const val ACTION_PENDING = "pending"
    const val ACTION_APPROVED = "approved"
    const val ACTION_REJECTED = "rejected"
    const val ACTION_EXPIRED = "expired"
    const val ACTION_CANCELLED = "cancelled"

    private val ACTIVE_RUN = setOf(QUEUED, RUNNING, AWAITING_CONFIRMATION)

    /** An unknown run status counts as final. */
    fun isActiveRun(status: String?): Boolean = status in ACTIVE_RUN

    /** A run that is working right now, as opposed to waiting for the user. */
    fun isWorking(status: String?): Boolean = status == QUEUED || status == RUNNING
}

object ChatDomain {
    const val ENTRIES = "entries"
    const val FOODS = "foods"
    const val RECIPES = "recipes"
    const val GOALS = "goals"
    const val WEIGHT = "weight"
    const val SLEEP = "sleep"
    const val SUPPLEMENTS = "supplements"
    const val DAY_PROPERTIES = "dayProperties"
    const val LABELS = "labels"
    const val PREFERENCES = "preferences"
    const val FASTING = "fasting"
    const val REMINDERS = "reminders"
    const val MEAL_TYPES = "mealTypes"
}
