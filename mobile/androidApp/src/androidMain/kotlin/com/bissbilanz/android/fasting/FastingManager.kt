package com.bissbilanz.android.fasting

import android.content.Context
import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.FastingSessionUpsert
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlinx.serialization.json.Json
import kotlin.time.Clock
import kotlin.time.Duration.Companion.days
import kotlin.time.Instant
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

/**
 * Owns the running fast: session lifecycle in [FastingSessionStore], the ongoing
 * notification mirroring it (Android's counterpart to the iOS Live Activity), and
 * the `isFastingDay` write-back on stop, which goes through [EntryRepository] so it
 * follows the same offline-first sync path as the day-log toggle.
 *
 * Finished fasts are also queued for upload as their own resource so the web
 * history can list them. The running fast never leaves the device.
 */
class FastingManager(
    private val context: Context,
    private val store: FastingSessionStore,
    private val entryRepository: EntryRepository,
    private val errorReporter: ErrorReporter,
    private val syncQueue: SyncQueue,
    private val json: Json,
    private val api: BissbilanzApi,
    private val appModeManager: AppModeManager,
) {
    private val _session = MutableStateFlow(store.loadCurrent())
    val session: StateFlow<FastingSession?> = _session.asStateFlow()

    private val _history = MutableStateFlow(store.loadHistory())
    val history: StateFlow<List<FastingSession>> = _history.asStateFlow()

    val isFasting: Boolean get() = _session.value != null

    /**
     * Starts a fast. [startedAt] defaults to now but may lie in the past for a
     * fast that began before the user remembered to start the timer; a future
     * start is clamped to now.
     */
    @OptIn(ExperimentalUuidApi::class)
    fun start(
        targetHours: Int,
        startedAt: Instant = Clock.System.now(),
    ) {
        if (_session.value != null) return
        val session =
            FastingSession(
                id = Uuid.random().toString(),
                startedAtEpochMs = minOf(startedAt, Clock.System.now()).toEpochMilliseconds(),
                targetHours = targetHours,
            )
        store.saveCurrent(session)
        _session.value = session
        FastingNotifier.show(context, session)
    }

    fun changeTarget(hours: Int) {
        val current = _session.value ?: return
        update(current.copy(targetHours = hours))
    }

    /** Moves the running fast's start; the notification chronometer re-bases on the new instant. */
    fun changeStart(startedAt: Instant) {
        val current = _session.value ?: return
        val clamped = minOf(startedAt, Clock.System.now())
        update(current.copy(startedAtEpochMs = clamped.toEpochMilliseconds()))
    }

    private fun update(session: FastingSession) {
        store.saveCurrent(session)
        _session.value = session
        FastingNotifier.show(context, session)
    }

    /**
     * Ends the fast, queues it for upload and marks the day it ended as a fasting
     * day, matching iOS. The session is cleared first so the UI never keeps
     * counting if the day-properties write fails.
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
            upload(ended)
            val date = endedAt.toLocalDateTime(TimeZone.currentSystemDefault()).date.toString()
            entryRepository.setDayProperties(date, isFastingDay = true)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
        }
    }

    /**
     * Ends the running fast without leaving a trace — no history row, no fasting-day
     * mark and no sync operation, matching iOS `FastingTimerManager.discard`. For fasts
     * started by mistake or abandoned after a few minutes.
     */
    fun discard() {
        if (_session.value == null) return
        store.clearCurrent()
        _session.value = null
        FastingNotifier.clear(context)
    }

    /** Rewrites a finished fast's start, end or target. Ignored unless the range is still valid. */
    suspend fun updateHistory(session: FastingSession) {
        val endedAt = session.endedAtEpochMs ?: return
        if (endedAt <= session.startedAtEpochMs) return
        store.updateInHistory(session)
        _history.value = store.loadHistory()
        try {
            upload(session)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
        }
    }

    suspend fun deleteHistory(id: String) {
        store.removeFromHistory(id)
        _history.value = store.loadHistory()
        try {
            syncQueue.enqueue(SyncOperation.DeleteFast(id))
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
        }
    }

    private suspend fun upload(session: FastingSession) {
        syncQueue.enqueue(SyncOperation.UpsertFast(session.id, json.encodeToString(session.toUpsert())))
    }

    /**
     * Reconciles in-memory state with the store — the notification's End Fast
     * action can clear the session from outside the UI — and re-posts the
     * notification if it was dismissed while a fast is still running. Synchronous
     * (no network) so it can be called from a [android.content.BroadcastReceiver].
     */
    fun reconcileLocal() {
        val stored = store.loadCurrent()
        _session.value = stored
        _history.value = store.loadHistory()
        if (stored != null) {
            FastingNotifier.show(context, stored)
        } else {
            FastingNotifier.clear(context)
        }
    }

    /**
     * [reconcileLocal] plus a pull of finished fasts from the server, so a fast
     * completed elsewhere (web, iOS) shows up in this device's history. Called
     * from the fasting screens, which have a coroutine scope to run it in.
     */
    suspend fun refresh() {
        reconcileLocal()
        pullFromServer()
        _history.value = store.loadHistory()
    }

    /**
     * Merges server-side fasts into the local history by id. Never touches the
     * running fast (server never has it — only finished fasts are uploaded) and
     * skips any history id with an un-uploaded (queued or in-flight) sync
     * operation, so a local edit still waiting to upload is not clobbered by a
     * stale server copy.
     */
    private suspend fun pullFromServer() {
        if (appModeManager.isLocal) return
        try {
            val to = Clock.System.now()
            val from = to - 90.days
            val pending = pendingFastIds()
            val runningId = _session.value?.id
            for (remote in api.getFastingSessions(limit = 200, from = from.toString(), to = to.toString())) {
                if (remote.id == runningId || remote.id in pending) continue
                remote.toLocalOrNull()?.let(store::updateInHistory)
            }
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
        }
    }

    /** Fast ids with an un-uploaded (queued or in-flight) sync operation. */
    private suspend fun pendingFastIds(): Set<String> =
        syncQueue
            .all()
            .asSequence()
            .filter { it.operation.affectedTable == "fasts" }
            .mapNotNull { it.operation.affectedId }
            .toSet()
}

/** Converts a server fast into the device-local, epoch-millis-based model. */
private fun com.bissbilanz.api.generated.model.FastingSession.toLocalOrNull(): FastingSession? =
    runCatching {
        FastingSession(
            id = id,
            startedAtEpochMs = Instant.parse(startedAt).toEpochMilliseconds(),
            targetHours = targetHours,
            endedAtEpochMs = Instant.parse(endedAt).toEpochMilliseconds(),
        )
    }.getOrNull()

/** Wire shape for a finished fast; the local id doubles as the server id. */
fun FastingSession.toUpsert(): FastingSessionUpsert =
    FastingSessionUpsert(
        id = id,
        startedAt = startedAt.toString(),
        endedAt = checkNotNull(endedAt) { "only finished fasts are uploaded" }.toString(),
        targetHours = targetHours,
    )
