package com.bissbilanz.repository

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.Reminder
import com.bissbilanz.api.generated.model.ReminderCreate
import com.bissbilanz.api.generated.model.ReminderUpdate
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.sync.rewriteQueuedCreate
import com.bissbilanz.userdata.UserDataDatabase
import com.bissbilanz.util.decodeOrNull
import com.bissbilanz.util.isTempId
import com.bissbilanz.util.newTempId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.time.Clock

/**
 * General logging reminders (weight / meal / sleep). Mirrors [SupplementRepository] —
 * same local-mode temp-id handling and offline queue — but is a flat, ingredient-less
 * table, so it is closer in shape to [WeightRepository].
 */
class ReminderRepository(
    private val api: BissbilanzApi,
    private val db: UserDataDatabase,
    private val cacheDb: BissbilanzDatabase,
    private val syncQueue: SyncQueue,
    private val json: Json,
    private val errorReporter: ErrorReporter,
    private val appModeManager: AppModeManager,
) {
    /**
     * Fired whenever the cached reminder rows change — create, update, delete, or a
     * server refresh. Android rebuilds its reminder alarms from this; the worker's
     * unique work collapses a refresh's row-by-row burst into a single reschedule.
     */
    var onRemindersChanged: (() -> Unit)? = null

    fun reminders(): Flow<List<Reminder>> =
        db.userDataDatabaseQueries
            .selectAllReminders()
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.mapNotNull { json.decodeOrNull<Reminder>(it.jsonData) } }

    /**
     * Replaces the cached list with the server's, unlike [SupplementRepository.refresh]
     * (which only upserts): a reminder deleted from another device must disappear here
     * too, and there is no separate "all including inactive" call to catch up later.
     * Rows with an un-uploaded local write are kept so a refresh racing an offline
     * create/edit does not make it flicker away until the queue drains.
     */
    suspend fun refresh() {
        if (appModeManager.isLocal) return
        val reminders = api.getReminders()
        withContext(Dispatchers.IO) { cacheReminders(reminders) }
    }

    suspend fun createReminder(reminder: ReminderCreate): Reminder {
        val temp = reminderCreateToReminder(reminder)
        withContext(Dispatchers.IO) { cacheReminder(temp) }
        syncQueue.enqueue(SyncOperation.CreateReminder(json.encodeToString(reminder), localId = temp.id))
        return temp
    }

    suspend fun updateReminder(
        id: String,
        reminder: ReminderUpdate,
    ): Reminder {
        val existing =
            db.userDataDatabaseQueries
                .selectAllReminders()
                .executeAsList()
                .mapNotNull { json.decodeOrNull<Reminder>(it.jsonData) }
                .find { it.id == id }
        val result = mergeUpdate(existing, id, reminder)
        withContext(Dispatchers.IO) { cacheReminder(result) }
        if (id.isTempId()) {
            coalesceQueuedCreate(id, reminder)
        } else {
            syncQueue.enqueue(SyncOperation.UpdateReminder(id, json.encodeToString(reminder)))
        }
        return result
    }

    suspend fun deleteReminder(id: String) {
        withContext(Dispatchers.IO) { db.userDataDatabaseQueries.deleteReminder(id) }
        onRemindersChanged?.invoke()
        if (id.isTempId()) {
            syncQueue.removeByAffected("reminders", id)
        } else {
            syncQueue.enqueue(SyncOperation.DeleteReminder(id))
        }
    }

    /**
     * Rewrites the still-queued Create operation for a temp-id reminder so the
     * eventual upload carries the edited values. If the create has already been
     * drained (no queued op found), the update is skipped — the temp id is unknown
     * server-side.
     */
    private suspend fun coalesceQueuedCreate(
        tempId: String,
        update: ReminderUpdate,
    ) {
        syncQueue.rewriteQueuedCreate("reminders", tempId) { op ->
            val create = op as? SyncOperation.CreateReminder ?: return@rewriteQueuedCreate null
            val body = json.decodeOrNull<ReminderCreate>(create.body) ?: return@rewriteQueuedCreate null
            create.copy(body = json.encodeToString(mergeCreate(body, update)))
        }
    }

    private fun cacheReminder(reminder: Reminder) {
        db.userDataDatabaseQueries.insertReminder(
            id = reminder.id,
            time = reminder.time,
            enabled = if (reminder.enabled) 1L else 0L,
            jsonData = json.encodeToString(reminder),
        )
        onRemindersChanged?.invoke()
    }

    private suspend fun cacheReminders(reminders: List<Reminder>) {
        val pendingIds = pendingReminderIds()
        val queries = db.userDataDatabaseQueries
        val preserved =
            queries
                .selectAllReminders()
                .executeAsList()
                .filter { it.id in pendingIds }
                .mapNotNull { json.decodeOrNull<Reminder>(it.jsonData) }
        queries.transaction {
            queries.deleteAllReminders()
            reminders.forEach { reminder -> if (reminder.id !in pendingIds) cacheReminder(reminder) }
            preserved.forEach { cacheReminder(it) }
        }
        // SyncMeta lives in the cache database; written after the user-data commit.
        cacheDb.bissbilanzDatabaseQueries.upsertSyncMeta(
            entityType = "reminders",
            lastSyncedAt = Clock.System.now().toString(),
        )
    }

    /** Reminder ids with an un-uploaded (queued or in-flight) sync operation. */
    private suspend fun pendingReminderIds(): Set<String> =
        syncQueue
            .all()
            .asSequence()
            .filter { it.operation.affectedTable == "reminders" }
            .mapNotNull { it.operation.affectedId }
            .toSet()

    private fun reminderCreateToReminder(create: ReminderCreate): Reminder {
        val now = Clock.System.now().toString()
        return Reminder(
            id = newTempId(),
            userId = "",
            kind = Reminder.Kind.valueOf(create.kind.name),
            mealType = if (create.kind == ReminderCreate.Kind.meal) create.mealType else null,
            time = create.time,
            weekdays = create.weekdays ?: DEFAULT_WEEKDAYS,
            enabled = create.enabled ?: true,
            createdAt = now,
            updatedAt = now,
        )
    }

    /**
     * Merges a [ReminderUpdate] onto the cached row (or, if the row is missing from the
     * cache, builds a best-effort placeholder from the update alone). As on the server
     * (`updateReminder` in `src/lib/server/reminders.ts`) and the web client
     * (`reminder-service.svelte.ts`), a `kind` change always forces `mealType` to move
     * with it — a switch away from `meal` without resending `mealType` must still clear
     * the old value locally, or the cached row would show a stale meal type.
     */
    private fun mergeUpdate(
        existing: Reminder?,
        id: String,
        update: ReminderUpdate,
    ): Reminder {
        val now = Clock.System.now().toString()
        val kind = update.kind?.let { Reminder.Kind.valueOf(it.name) } ?: existing?.kind ?: Reminder.Kind.weight
        val mealType =
            if (update.kind != null) {
                if (kind == Reminder.Kind.meal) update.mealType else null
            } else {
                update.mealType ?: existing?.mealType
            }
        return Reminder(
            id = id,
            userId = existing?.userId ?: "",
            kind = kind,
            mealType = mealType,
            time = update.time ?: existing?.time ?: "08:00",
            weekdays = update.weekdays ?: existing?.weekdays ?: DEFAULT_WEEKDAYS,
            enabled = update.enabled ?: existing?.enabled ?: true,
            createdAt = existing?.createdAt,
            updatedAt = now,
        )
    }

    private fun mergeCreate(
        body: ReminderCreate,
        update: ReminderUpdate,
    ): ReminderCreate {
        val kind = update.kind?.let { ReminderCreate.Kind.valueOf(it.name) } ?: body.kind
        val mealType =
            if (update.kind != null) {
                if (kind == ReminderCreate.Kind.meal) update.mealType else null
            } else {
                update.mealType ?: body.mealType
            }
        return body.copy(
            kind = kind,
            mealType = mealType,
            time = update.time ?: body.time,
            weekdays = update.weekdays ?: body.weekdays,
            enabled = update.enabled ?: body.enabled,
        )
    }

    companion object {
        private val DEFAULT_WEEKDAYS = listOf(0, 1, 2, 3, 4, 5, 6)
    }
}
