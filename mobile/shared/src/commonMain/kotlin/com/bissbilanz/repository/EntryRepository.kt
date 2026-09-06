package com.bissbilanz.repository

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.model.*
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.sync.rewriteQueuedCreate
import com.bissbilanz.userdata.UserDataDatabase
import com.bissbilanz.util.EntryField
import com.bissbilanz.util.decodeOrNull
import com.bissbilanz.util.isTempId
import com.bissbilanz.util.jsonKeys
import com.bissbilanz.util.newTempId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.time.Clock

class EntryRepository(
    private val api: BissbilanzApi,
    private val db: UserDataDatabase,
    private val cacheDb: BissbilanzDatabase,
    private val syncQueue: SyncQueue,
    private val json: Json,
    private val errorReporter: ErrorReporter,
    private val appModeManager: AppModeManager,
) {
    private var currentDate: String? = null
    var onEntryChanged: (suspend () -> Unit)? = null

    /**
     * Fired after a server refresh replaced the cached day. Entries logged
     * outside this device (web, MCP, iOS) only arrive through refresh, so this
     * is where the Health Connect export catches them — [onEntryChanged] only
     * covers mutations made in the app itself.
     */
    var onEntriesRefreshed: (suspend (date: String) -> Unit)? = null

    fun entriesByDate(date: String): Flow<List<Entry>> =
        db.userDataDatabaseQueries
            .selectEntriesByDate(date)
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.mapNotNull { json.decodeOrNull<Entry>(it.jsonData) } }

    suspend fun entriesByDateOnce(date: String): List<Entry> =
        db.userDataDatabaseQueries
            .selectEntriesByDate(date)
            .executeAsList()
            .mapNotNull { json.decodeOrNull<Entry>(it.jsonData) }

    suspend fun refresh(date: String) {
        currentDate = date
        // In Local mode the cache is the primary store; there is nothing to refresh.
        if (appModeManager.isLocal) return
        val entries = api.getEntries(date)
        cacheEntries(date, entries)
        onEntriesRefreshed?.invoke(date)
    }

    suspend fun createEntry(
        entry: EntryCreate,
        food: Food? = null,
        recipe: Recipe? = null,
    ): Entry {
        val tempEntry = entryCreateToEntry(entry, food, recipe)
        cacheEntry(tempEntry)
        syncQueue.enqueue(SyncOperation.CreateEntry(json.encodeToString(entry), localId = tempEntry.id))
        onEntryChanged?.invoke()
        return tempEntry
    }

    /**
     * [cleared] names the fields the user deliberately emptied. The generated
     * [EntryUpdate] represents both "unchanged" and "cleared" as null, so without it a
     * cleared note/quick macro/nutrient map keeps its old value both here and on the
     * server. See `com.bissbilanz.util.PartialUpdate`.
     */
    suspend fun updateEntry(
        id: String,
        entry: EntryUpdate,
        cleared: Set<EntryField> = emptySet(),
    ): Entry {
        // Look the row up by id rather than by the viewed date: the shared
        // `currentDate` is reset to today by the post-sync refresh, so a date-based
        // lookup misses entries edited on any other day and silently drops the
        // optimistic write (the edit then only appears after a manual refresh).
        val existing =
            db.userDataDatabaseQueries
                .selectEntryById(id)
                .executeAsOneOrNull()
                ?.let { json.decodeOrNull<Entry>(it.jsonData) }
        val result =
            if (existing != null) {
                val updated = applyUpdate(existing, entry, cleared)
                cacheEntry(updated)
                updated
            } else {
                Entry(
                    id = id,
                    userId = "",
                    date = entry.date ?: currentDate ?: "",
                    mealType = entry.mealType ?: "",
                    servings = entry.servings ?: 1.0,
                )
            }
        if (id.isTempId()) {
            coalesceQueuedCreate(id, entry, cleared)
        } else {
            syncQueue.enqueue(SyncOperation.UpdateEntry(id, json.encodeToString(entry), cleared.jsonKeys()))
        }
        onEntryChanged?.invoke()
        return result
    }

    suspend fun deleteEntry(id: String) {
        db.userDataDatabaseQueries.deleteEntry(id)
        if (id.isTempId()) {
            syncQueue.removeByAffected("entries", id)
        } else {
            syncQueue.enqueue(SyncOperation.DeleteEntry(id))
        }
        onEntryChanged?.invoke()
    }

    /**
     * Rewrites the still-queued Create operation for a temp-id entry so the eventual
     * upload carries the edited values. If the create has already been drained (no
     * queued op found), the update is skipped, matching the previous behavior.
     */
    private suspend fun coalesceQueuedCreate(
        tempId: String,
        update: EntryUpdate,
        cleared: Set<EntryField>,
    ) {
        syncQueue.rewriteQueuedCreate("entries", tempId) { op ->
            val create = op as? SyncOperation.CreateEntry ?: return@rewriteQueuedCreate null
            val body = json.decodeOrNull<EntryCreate>(create.body) ?: return@rewriteQueuedCreate null
            // A create body needs no explicit nulls: an omitted field is already
            // "no value", so nulling the merged property is the whole clear.
            val merged = applyUpdate(body, update, cleared)
            create.copy(body = json.encodeToString(merged))
        }
    }

    /**
     * Cache-first day properties. In Local mode the cache is authoritative; in Synced
     * mode the API result is cached and the cache serves as offline fallback.
     */
    suspend fun getDayProperties(date: String): DayProperties? {
        if (appModeManager.isLocal) return cachedDayProperties(date)
        return try {
            val props = api.getDayProperties(date)
            if (props != null) {
                cacheDayProperties(props)
            } else {
                db.userDataDatabaseQueries.deleteDayProperties(date)
            }
            props
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            cachedDayProperties(date)
        }
    }

    suspend fun setDayProperties(
        date: String,
        isFastingDay: Boolean,
    ): DayProperties {
        val props = DayProperties(date = date, isFastingDay = isFastingDay)
        cacheDayProperties(props)
        if (!appModeManager.isLocal) {
            syncQueue.enqueue(SyncOperation.SetDayProperties(date, isFastingDay))
        }
        return props
    }

    suspend fun deleteDayProperties(date: String) {
        db.userDataDatabaseQueries.deleteDayProperties(date)
        if (!appModeManager.isLocal) {
            syncQueue.enqueue(SyncOperation.DeleteDayProperties(date))
        }
    }

    private fun cachedDayProperties(date: String): DayProperties? =
        db.userDataDatabaseQueries
            .selectDayProperties(date)
            .executeAsOneOrNull()
            ?.let { DayProperties(date = it.date, isFastingDay = it.isFastingDay != 0L) }

    private fun cacheDayProperties(props: DayProperties) {
        db.userDataDatabaseQueries.upsertDayProperties(
            date = props.date,
            isFastingDay = if (props.isFastingDay) 1L else 0L,
        )
    }

    suspend fun copyEntries(
        fromDate: String,
        toDate: String,
    ): Int {
        val source = entriesByDateOnce(fromDate)
        var count = 0
        for (entry in source) {
            val create =
                EntryCreate(
                    mealType = entry.mealType,
                    servings = entry.servings,
                    date = toDate,
                    foodId = entry.foodId,
                    recipeId = entry.recipeId,
                    notes = entry.notes,
                    quickName = entry.quickName,
                    quickCalories = entry.quickCalories,
                    quickProtein = entry.quickProtein,
                    quickCarbs = entry.quickCarbs,
                    quickFat = entry.quickFat,
                    quickFiber = entry.quickFiber,
                    quickNutrients = entry.quickNutrients,
                    eatenAt = entry.eatenAt,
                )
            createEntry(create, food = entry.food, recipe = entry.recipe)
            count++
        }
        return count
    }

    private fun cacheEntry(entry: Entry) {
        db.userDataDatabaseQueries.cacheEntryRow(entry, json)
    }

    private suspend fun cacheEntries(
        date: String,
        entries: List<Entry>,
    ) {
        // Local rows with un-uploaded writes must survive a server refresh. A forced
        // refresh right after an edit/create (the UI's onSaved handlers call it) races
        // the async sync-queue upload; without this guard the incoming — still stale —
        // server state overwrites the optimistic local change and reverts it in the UI
        // until the next manual refresh. Preserve temp-id creates and any entry id that
        // still has a queued (or in-flight) sync operation.
        val pendingIds = pendingEntryIds()
        val queries = db.userDataDatabaseQueries
        // Local rows to keep after wiping the day: optimistic temp-id creates whose
        // upload is still queued or in flight, and rows carrying a queued update (a
        // queued delete already removed its row, so it simply isn't present here).
        // `pendingIds` holds the temp id of every queued create, so a temp row that
        // isn't in it has no operation left to run: its create already uploaded (the
        // sync manager swapped the row for the server record) or was dead-lettered.
        // Keeping those would re-add the local copy of an entry the server list
        // already carries, duplicating it in the day log on every refresh.
        val preserved =
            queries
                .selectEntriesByDate(date)
                .executeAsList()
                .filter { it.id in pendingIds }
                .mapNotNull { json.decodeOrNull<Entry>(it.jsonData) }
        queries.transaction {
            queries.deleteEntriesByDate(date)
            // Skip any server row whose id still has a queued local op: a queued
            // update is re-applied from `preserved` below, and a queued delete must
            // not be resurrected by the (still-present) server copy.
            entries.forEach { entry ->
                if (entry.id !in pendingIds) cacheEntry(entry.copy(date = date))
            }
            preserved.forEach { cacheEntry(it) }
        }
        // SyncMeta lives in the cache database; written after the user-data commit.
        cacheDb.bissbilanzDatabaseQueries.upsertSyncMeta(
            entityType = "entries:$date",
            lastSyncedAt = Clock.System.now().toString(),
        )
    }

    /** Entry ids with an un-uploaded (queued or in-flight) sync operation. */
    private suspend fun pendingEntryIds(): Set<String> =
        syncQueue
            .all()
            .asSequence()
            .filter { it.operation.affectedTable == "entries" }
            .mapNotNull { it.operation.affectedId }
            .toSet()

    private fun entryCreateToEntry(
        entry: EntryCreate,
        food: Food? = null,
        recipe: Recipe? = null,
    ): Entry =
        Entry(
            id = newTempId(),
            userId = "",
            foodId = entry.foodId,
            recipeId = entry.recipeId,
            date = entry.date,
            mealType = entry.mealType,
            servings = entry.servings,
            notes = entry.notes,
            quickName = entry.quickName,
            quickCalories = entry.quickCalories,
            quickProtein = entry.quickProtein,
            quickCarbs = entry.quickCarbs,
            quickFat = entry.quickFat,
            quickFiber = entry.quickFiber,
            quickNutrients = entry.quickNutrients,
            eatenAt = entry.eatenAt,
            createdAt = Clock.System.now().toString(),
            food = food,
            recipe = recipe,
        )

    private fun applyUpdate(
        existing: EntryCreate,
        update: EntryUpdate,
        cleared: Set<EntryField>,
    ): EntryCreate =
        existing.copy(
            foodId = update.foodId ?: existing.foodId,
            recipeId = update.recipeId ?: existing.recipeId,
            mealType = update.mealType ?: existing.mealType,
            servings = update.servings ?: existing.servings,
            date = update.date ?: existing.date,
            notes = cleared.pick(EntryField.NOTES, update.notes, existing.notes),
            quickName = cleared.pick(EntryField.QUICK_NAME, update.quickName, existing.quickName),
            quickCalories = cleared.pick(EntryField.QUICK_CALORIES, update.quickCalories, existing.quickCalories),
            quickProtein = cleared.pick(EntryField.QUICK_PROTEIN, update.quickProtein, existing.quickProtein),
            quickCarbs = cleared.pick(EntryField.QUICK_CARBS, update.quickCarbs, existing.quickCarbs),
            quickFat = cleared.pick(EntryField.QUICK_FAT, update.quickFat, existing.quickFat),
            quickFiber = cleared.pick(EntryField.QUICK_FIBER, update.quickFiber, existing.quickFiber),
            quickNutrients = cleared.pick(EntryField.QUICK_NUTRIENTS, update.quickNutrients, existing.quickNutrients),
            eatenAt = update.eatenAt ?: existing.eatenAt,
        )

    private fun applyUpdate(
        existing: Entry,
        update: EntryUpdate,
        cleared: Set<EntryField>,
    ): Entry =
        existing.copy(
            foodId = update.foodId ?: existing.foodId,
            recipeId = update.recipeId ?: existing.recipeId,
            mealType = update.mealType ?: existing.mealType,
            servings = update.servings ?: existing.servings,
            date = update.date ?: existing.date,
            notes = cleared.pick(EntryField.NOTES, update.notes, existing.notes),
            quickName = cleared.pick(EntryField.QUICK_NAME, update.quickName, existing.quickName),
            quickCalories = cleared.pick(EntryField.QUICK_CALORIES, update.quickCalories, existing.quickCalories),
            quickProtein = cleared.pick(EntryField.QUICK_PROTEIN, update.quickProtein, existing.quickProtein),
            quickCarbs = cleared.pick(EntryField.QUICK_CARBS, update.quickCarbs, existing.quickCarbs),
            quickFat = cleared.pick(EntryField.QUICK_FAT, update.quickFat, existing.quickFat),
            quickFiber = cleared.pick(EntryField.QUICK_FIBER, update.quickFiber, existing.quickFiber),
            quickNutrients = cleared.pick(EntryField.QUICK_NUTRIENTS, update.quickNutrients, existing.quickNutrients),
            eatenAt = update.eatenAt ?: existing.eatenAt,
        )

    /** The cache-side counterpart of the explicit null the request carries. */
    private fun <T> Set<EntryField>.pick(
        field: EntryField,
        updated: T?,
        existing: T?,
    ): T? = if (field in this) null else updated ?: existing
}
