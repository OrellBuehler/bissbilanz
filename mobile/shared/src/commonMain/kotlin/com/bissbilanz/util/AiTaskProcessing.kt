package com.bissbilanz.util

import com.bissbilanz.api.generated.model.AiTask
import com.bissbilanz.api.generated.model.ClaudeCapability
import com.bissbilanz.api.generated.model.Preferences

const val PROCESSOR_CLAUDE = "claude"

private val knownProcessorKinds = setOf("assistant", "device", PROCESSOR_CLAUDE)

/**
 * The processor the user really chose. The legacy [Preferences.aiTaskProcessor] enum
 * reads "assistant" while Claude is stored, so a known kind wins whenever the server sent
 * it; a kind this build does not know falls back to the legacy value.
 */
fun Preferences.effectiveAiTaskProcessor(): String = aiTaskProcessorKind?.takeIf { it in knownProcessorKinds } ?: aiTaskProcessor.value

fun Preferences.isClaudeSelected(): Boolean = effectiveAiTaskProcessor() == PROCESSOR_CLAUDE

/**
 * A missing capability means "unknown", which is treated like unavailable: the app only
 * offers or sends to Claude after the preferences GET said it can run.
 */
fun ClaudeCapability?.isClaudeAvailable(): Boolean = this?.available == true

/** Claude is selected and the server says it can run right now. */
fun claudeProcessingEnabled(
    prefs: Preferences?,
    capability: ClaudeCapability?,
): Boolean = prefs?.isClaudeSelected() == true && capability.isClaudeAvailable()

enum class ClaudeTaskState { QUEUED, RUNNING, RETRYING, PROPOSED, BLOCKED }

/**
 * The state chip of a pending task, only when the server reports a Claude run for it. An
 * unknown state reads like "queued"; no run (the run is created asynchronously) means no chip.
 */
fun AiTask.claudeTaskState(): ClaudeTaskState? {
    if (status != AiTask.Status.pending) return null
    val processing = claudeProcessing ?: return null
    return when (processing.state) {
        "running" -> ClaudeTaskState.RUNNING
        "retrying" -> ClaudeTaskState.RETRYING
        "proposed" -> ClaudeTaskState.PROPOSED
        "blocked" -> ClaudeTaskState.BLOCKED
        else -> ClaudeTaskState.QUEUED
    }
}

enum class TaskResolver { CLAUDE, ASSISTANT, ON_DEVICE, PRIVATE_CLOUD }

/**
 * Who resolved the task. [AiTask.processedByKind] is checked first so "claude" is not lost
 * to the legacy enum, which reads "assistant"; an unknown kind falls back to the legacy
 * field. It can be set on a reopened pending task, so callers only show it for a task
 * that has left pending.
 */
fun AiTask.resolver(): TaskResolver? =
    when (processedByKind) {
        PROCESSOR_CLAUDE -> TaskResolver.CLAUDE
        "assistant" -> TaskResolver.ASSISTANT
        "on_device" -> TaskResolver.ON_DEVICE
        "private_cloud" -> TaskResolver.PRIVATE_CLOUD
        else ->
            when (processedBy) {
                AiTask.ProcessedBy.assistant -> TaskResolver.ASSISTANT
                AiTask.ProcessedBy.on_device -> TaskResolver.ON_DEVICE
                AiTask.ProcessedBy.private_cloud -> TaskResolver.PRIVATE_CLOUD
                null -> null
            }
    }
