package com.bissbilanz.android.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.generated.model.Reminder
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.ReminderRepository
import com.bissbilanz.repository.SleepRepository
import com.bissbilanz.repository.WeightRepository
import com.bissbilanz.util.ReminderSchedule
import com.bissbilanz.util.normalizeMealType
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import org.koin.core.Koin
import org.koin.java.KoinJavaComponent
import kotlin.time.Clock

/**
 * Fires when a general logging reminder comes due. Parallel to
 * [SupplementReminderReceiver] — same `goAsync` shape and the same "everything below can
 * have changed since the alarm was armed" guards — but checks a different "already done"
 * signal per [Reminder.Kind]: a weight entry, a sleep entry for the wake date, or any
 * food entry with the reminder's meal type.
 */
class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(
        context: Context,
        intent: Intent,
    ) {
        val reminderId = intent.getStringExtra(EXTRA_REMINDER_ID) ?: return
        val hhmm = intent.getStringExtra(EXTRA_TIME) ?: return
        val isSnooze = intent.getBooleanExtra(EXTRA_IS_SNOOZE, false)
        val armedDate =
            intent
                .getStringExtra(EXTRA_DATE)
                ?.let { runCatching { LocalDate.parse(it) }.getOrNull() }

        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            val koin = KoinJavaComponent.getKoin()
            try {
                withTimeout(TIMEOUT_MS) {
                    val repository = koin.get<ReminderRepository>()
                    // The date this reminder is *for*. An inexact alarm can drift past
                    // midnight (and a snooze can be re-armed across it), so the armed
                    // date wins over the fire-time clock; the fallback covers alarms
                    // armed by a version that didn't attach it.
                    val date = armedDate ?: Clock.System.todayIn(TimeZone.currentSystemDefault())

                    val reminder = repository.reminders().first().firstOrNull { it.id == reminderId }

                    // A snooze belongs to the occurrence that already fired, so it must not
                    // re-arm; the daily alarm for this slot is still pending.
                    if (!isSnooze && reminder != null) {
                        ReminderScheduler.armNext(context, reminder)
                    }

                    // Deleted, or disabled after the alarm was armed.
                    if (reminder == null || !reminder.enabled) return@withTimeout
                    // The weekdays may have changed under the armed alarm.
                    if (!ReminderSchedule.isDueOn(reminder, date)) return@withTimeout
                    // Already logged — from the app, a widget, or another device whose
                    // entry has since synced down.
                    if (alreadyLogged(koin, reminder, date)) return@withTimeout
                    val preferences = koin.get<ReminderPreferences>()
                    if (preferences.isSkipped(reminderId, date)) return@withTimeout

                    ReminderNotifier.show(
                        context = context,
                        reminder = reminder,
                        notificationId = ReminderScheduler.notificationId(reminderId, hhmm),
                        actionRequestCodeBase = ReminderScheduler.actionRequestCodeBase(reminderId, hhmm),
                        hhmm = hhmm,
                        occurrenceDate = date.toString(),
                    )
                }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                koin.get<ErrorReporter>().captureException(e)
            } finally {
                pendingResult.finish()
            }
        }
    }

    /**
     * Best-effort refreshes the relevant repository before checking the cache — a stale
     * local cache would otherwise nag about a meal, weight or sleep entry logged from
     * another device. A refresh failure (offline, timeout) is swallowed; the cached
     * value is still a reasonable answer.
     */
    private suspend fun alreadyLogged(
        koin: Koin,
        reminder: Reminder,
        date: LocalDate,
    ): Boolean {
        val dateStr = date.toString()
        return when (reminder.kind) {
            Reminder.Kind.weight -> {
                val repo = koin.get<WeightRepository>()
                runCatching { repo.refresh() }
                repo.entries().first().any { it.entryDate == dateStr }
            }

            Reminder.Kind.sleep -> {
                val repo = koin.get<SleepRepository>()
                // SleepRepository.refresh() already swallows its own failures.
                repo.refresh()
                repo.entries().first().any { it.entryDate == dateStr }
            }

            Reminder.Kind.meal -> {
                val mealType = reminder.mealType ?: return false
                val repo = koin.get<EntryRepository>()
                runCatching { repo.refresh(dateStr) }
                repo.entriesByDateOnce(dateStr).any { normalizeMealType(it.mealType) == normalizeMealType(mealType) }
            }
        }
    }

    companion object {
        const val EXTRA_REMINDER_ID = "reminder_id"
        const val EXTRA_TIME = "reminder_time"
        const val EXTRA_IS_SNOOZE = "is_snooze"
        const val EXTRA_DATE = "occurrence_date"

        /** Comfortably under the ~10s a goAsync receiver gets. */
        private const val TIMEOUT_MS = 8_000L
    }
}
