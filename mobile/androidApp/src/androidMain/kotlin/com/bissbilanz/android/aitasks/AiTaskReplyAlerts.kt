package com.bissbilanz.android.aitasks

import android.content.Context
import com.bissbilanz.util.TaskReply
import java.util.concurrent.atomic.AtomicInteger

class AiTaskReplyAlerts(
    private val context: Context,
    private val prefs: AiTaskNotificationPreferences,
    private val enqueueCheck: (Context) -> Unit = AiTaskPollWorker::scheduleReplyCheck,
) {
    private val listVisible = AtomicInteger(0)

    val isListVisible: Boolean get() = listVisible.get() > 0

    suspend fun whileListVisible(block: suspend () -> Unit) {
        listVisible.incrementAndGet()
        try {
            block()
        } finally {
            listVisible.decrementAndGet()
        }
    }

    fun announce(unread: List<TaskReply>) {
        if (isListVisible) return
        val fresh = prefs.unannouncedReplies(unread.map { it.message.id }).toSet()
        if (fresh.isEmpty()) return
        if (AiTaskNotifier.showReplies(context, unread.filter { it.message.id in fresh })) {
            prefs.markRepliesAnnounced(fresh)
        }
    }

    fun shown(messageIds: Collection<String>) {
        if (messageIds.isEmpty()) return
        prefs.markRepliesAnnounced(messageIds)
        AiTaskNotifier.cancelReplies(context, messageIds)
    }

    fun scheduleCheck() {
        if (AiTaskNotifier.repliesEnabled(context)) enqueueCheck(context)
    }
}
