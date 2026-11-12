package com.bissbilanz.android.aitasks

import com.bissbilanz.ErrorReporter
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.util.TaskReply
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.IOException

class AiTaskDiaryRefresher(
    private val entryRepository: EntryRepository,
    private val prefs: AiTaskNotificationPreferences,
    private val errorReporter: ErrorReporter,
) {
    private class Pending(
        val reply: TaskReply,
        val attempts: Int,
    )

    private val pending = mutableMapOf<String, Pending>()
    private val mutex = Mutex()

    suspend fun refresh(changed: List<TaskReply>) =
        mutex.withLock {
            val candidates = (pending.values.map { it.reply } + changed).distinctBy { it.message.id }
            val fresh = prefs.unrefreshedChanges(candidates.map { it.message.id }).toSet()
            pending.keys.retainAll(fresh)
            candidates
                .filter { it.message.id in fresh && (pending[it.message.id]?.attempts ?: 0) < MAX_ATTEMPTS }
                .groupBy { it.task.date }
                .forEach { (date, replies) -> refreshDay(date, replies) }
        }

    private suspend fun refreshDay(
        date: String,
        replies: List<TaskReply>,
    ) {
        val ids = replies.map { it.message.id }
        try {
            entryRepository.refreshWithoutViewing(date)
            prefs.markChangesRefreshed(ids)
            pending.keys.removeAll(ids.toSet())
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            if (e.isNetworkFailure()) {
                errorReporter.addBreadcrumb("Diary refresh after an AI task answer failed: ${e.message.orEmpty().take(120)}", "ai-task")
            } else {
                errorReporter.captureException(e)
            }
            replies.forEach { pending[it.message.id] = Pending(it, (pending[it.message.id]?.attempts ?: 0) + 1) }
        }
    }

    private fun Throwable.isNetworkFailure(): Boolean = generateSequence(this) { it.cause }.any { it is IOException }

    companion object {
        const val MAX_ATTEMPTS = 5
    }
}
