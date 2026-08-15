package com.bissbilanz.android.fasting

import android.content.Context
import com.bissbilanz.ErrorReporter
import com.bissbilanz.repository.EntryRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

/**
 * Owns the running fast: session lifecycle in [FastingSessionStore], the ongoing
 * notification mirroring it (Android's counterpart to the iOS Live Activity), and
 * the `isFastingDay` write-back on stop, which goes through [EntryRepository] so it
 * follows the same offline-first sync path as the day-log toggle.
 */
class FastingManager(
    private val context: Context,
    private val store: FastingSessionStore,
    private val entryRepository: EntryRepository,
    private val errorReporter: ErrorReporter,
) {
    private val _session = MutableStateFlow(store.loadCurrent())
    val session: StateFlow<FastingSession?> = _session.asStateFlow()

    private val _history = MutableStateFlow(store.loadHistory())
    val history: StateFlow<List<FastingSession>> = _history.asStateFlow()

    val isFasting: Boolean get() = _session.value != null

    @OptIn(ExperimentalUuidApi::class)
    fun start(targetHours: Int) {
        if (_session.value != null) return
        val session =
            FastingSession(
                id = Uuid.random().toString(),
                startedAtEpochMs = Clock.System.now().toEpochMilliseconds(),
                targetHours = targetHours,
            )
        store.saveCurrent(session)
        _session.value = session
        FastingNotifier.show(context, session)
    }

    fun changeTarget(hours: Int) {
        val current = _session.value ?: return
        val updated = current.copy(targetHours = hours)
        store.saveCurrent(updated)
        _session.value = updated
        FastingNotifier.show(context, updated)
    }

    /**
     * Ends the fast and marks the day it ended as a fasting day, matching iOS.
     * The session is cleared first so the UI never keeps counting if the
     * day-properties write fails.
     */
    suspend fun stop() {
        val current = _session.value ?: return
        val endedAt = Clock.System.now()
        val ended = current.copy(endedAtEpochMs = endedAt.toEpochMilliseconds())
        store.appendToHistory(ended)
        store.clearCurrent()
        _session.value = null
        _history.value = store.loadHistory()
        FastingNotifier.clear(context)
        try {
            val date = endedAt.toLocalDateTime(TimeZone.currentSystemDefault()).date.toString()
            entryRepository.setDayProperties(date, isFastingDay = true)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
        }
    }

    /**
     * Reconciles in-memory state with the store — the notification's End Fast
     * action can clear the session from outside the UI — and re-posts the
     * notification if it was dismissed while a fast is still running.
     */
    fun refresh() {
        val stored = store.loadCurrent()
        _session.value = stored
        _history.value = store.loadHistory()
        if (stored != null) {
            FastingNotifier.show(context, stored)
        } else {
            FastingNotifier.clear(context)
        }
    }
}
