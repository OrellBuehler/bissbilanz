package com.bissbilanz.android.aitasks

import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.util.TaskReply

class AiTaskDiaryRefresher(
    private val entryRepository: EntryRepository,
    private val prefs: AiTaskNotificationPreferences,
) {
    suspend fun refresh(changed: List<TaskReply>) {
        val fresh = prefs.unrefreshedChanges(changed.map { it.message.id }).toSet()
        changed
            .filter { it.message.id in fresh }
            .groupBy { it.task.date }
            .forEach { (date, replies) ->
                entryRepository.refreshWithoutViewing(date)
                prefs.markChangesRefreshed(replies.map { it.message.id })
            }
    }
}
