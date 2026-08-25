package com.bissbilanz.android.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.bissbilanz.ErrorReporter
import com.bissbilanz.repository.SupplementRepository
import com.bissbilanz.util.SupplementSchedule
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import org.koin.java.KoinJavaComponent

/**
 * Fires when a reminder comes due. Reads the local supplement cache, so it needs to
 * suspend — `goAsync` rather than a Worker, because a Worker's scheduling delay would
 * push a time-of-day notification well past its time.
 *
 * The alarm was armed when the supplement last changed, so everything about it may have
 * moved since; each guard below is a way the reminder can turn out to be unwanted by the
 * time it actually fires.
 */
class SupplementReminderReceiver : BroadcastReceiver() {
    override fun onReceive(
        context: Context,
        intent: Intent,
    ) {
        val supplementId = intent.getStringExtra(EXTRA_SUPPLEMENT_ID) ?: return
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
                    val repository = koin.get<SupplementRepository>()
                    val preferences = koin.get<SupplementReminderPreferences>()
                    // The date this reminder is *for*. An inexact alarm can drift past
                    // midnight (and a snooze can be re-armed across it), so the armed
                    // date wins over the fire-time clock; the fallback covers alarms
                    // armed by a version that didn't attach it.
                    val date = armedDate ?: Clock.System.todayIn(TimeZone.currentSystemDefault())

                    val supplement = repository.supplements().first().firstOrNull { it.id == supplementId }

                    // A snooze belongs to the occurrence that already fired, so it must not
                    // re-arm; the daily alarm for this slot is still pending.
                    if (!isSnooze && supplement != null) {
                        SupplementReminderScheduler.armNext(context, supplement, hhmm)
                    }

                    // Deleted, or deactivated after the alarm was armed.
                    if (supplement == null || !supplement.isActive) return@withTimeout
                    // The schedule may have changed under the armed alarm.
                    if (!SupplementSchedule.isDueOn(supplement, date)) return@withTimeout
                    // Already ticked off — on the checklist, from a widget, or on another
                    // device whose log has since synced down.
                    val taken =
                        repository
                            .getChecklist(date.toString())
                            .any { it.supplementId == supplementId }
                    if (taken) return@withTimeout
                    if (preferences.isSkipped(supplementId, date)) return@withTimeout

                    SupplementReminderNotifier.show(
                        context = context,
                        supplement = supplement,
                        notificationId = SupplementReminderScheduler.notificationId(supplementId, hhmm),
                        actionRequestCodeBase =
                            SupplementReminderScheduler.actionRequestCodeBase(supplementId, hhmm),
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

    companion object {
        const val EXTRA_SUPPLEMENT_ID = "supplement_id"
        const val EXTRA_TIME = "reminder_time"
        const val EXTRA_IS_SNOOZE = "is_snooze"
        const val EXTRA_DATE = "occurrence_date"

        /** Comfortably under the ~10s a goAsync receiver gets. */
        private const val TIMEOUT_MS = 8_000L
    }
}
