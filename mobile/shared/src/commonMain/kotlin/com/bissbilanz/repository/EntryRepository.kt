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
import com.bissbilanz.util.decodeOrNull
import com.bissbilanz.util.isTempId
import com.bissbilanz.util.newTempId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.datetime.Clock
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

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

    suspend fun updateEntry(
        id: String,
        entry: EntryUpdate,
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
                val updated = applyUpdate(existing, entry)
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
            coalesceQueuedCreate(id, entry)
        } else {
            syncQueue.enqueue(SyncOperation.UpdateEntry(id, json.encodeToString(entry)))
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
    ) {
        syncQueue.rewriteQueuedCreate("entries", tempId) { op ->
            val create = op as? SyncOperation.CreateEntry ?: return@rewriteQueuedCreate null
            val body = json.decodeOrNull<EntryCreate>(create.body) ?: return@rewriteQueuedCreate null
            val merged = applyUpdate(body, update)
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
                    eatenAt = entry.eatenAt,
                )
            createEntry(create, food = entry.food, recipe = entry.recipe)
            count++
        }
        return count
    }

    private fun cacheEntry(entry: Entry) {
        val foodName = entry.food?.name ?: entry.recipe?.name ?: entry.foodName ?: entry.quickName
        val calories = entry.food?.calories ?: entry.calories ?: entry.quickCalories ?: 0.0
        val protein = entry.food?.protein ?: entry.protein ?: entry.quickProtein ?: 0.0
        val carbs = entry.food?.carbs ?: entry.carbs ?: entry.quickCarbs ?: 0.0
        val fat = entry.food?.fat ?: entry.fat ?: entry.quickFat ?: 0.0
        val fiber = entry.food?.fiber ?: entry.fiber ?: entry.quickFiber ?: 0.0
        db.userDataDatabaseQueries.insertEntry(
            id = entry.id,
            date = entry.date,
            mealType = entry.mealType,
            servings = entry.servings,
            foodId = entry.foodId,
            recipeId = entry.recipeId,
            foodName = foodName,
            calories = calories,
            protein = protein,
            carbs = carbs,
            fat = fat,
            fiber = fiber,
            jsonData = json.encodeToString(entry),
        )
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
        // Local rows to keep after wiping the day: optimistic temp-id creates and
        // rows carrying a queued update (a queued delete already removed its row,
        // so it simply isn't present here).
        val preserved =
            queries
                .selectEntriesByDate(date)
                .executeAsList()
                .filter { it.id.isTempId() || it.id in pendingIds }
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
            eatenAt = entry.eatenAt,
            createdAt = Clock.System.now().toString(),
            food = food,
            recipe = recipe,
        )

    private fun applyUpdate(
        existing: EntryCreate,
        update: EntryUpdate,
    ): EntryCreate =
        existing.copy(
            foodId = update.foodId ?: existing.foodId,
            recipeId = update.recipeId ?: existing.recipeId,
            mealType = update.mealType ?: existing.mealType,
            servings = update.servings ?: existing.servings,
            date = update.date ?: existing.date,
            notes = update.notes ?: existing.notes,
            quickName = update.quickName ?: existing.quickName,
            quickCalories = update.quickCalories ?: existing.quickCalories,
            quickProtein = update.quickProtein ?: existing.quickProtein,
            quickCarbs = update.quickCarbs ?: existing.quickCarbs,
            quickFat = update.quickFat ?: existing.quickFat,
            quickFiber = update.quickFiber ?: existing.quickFiber,
            eatenAt = update.eatenAt ?: existing.eatenAt,
        )

    private fun applyUpdate(
        existing: Entry,
        update: EntryUpdate,
    ): Entry =
        existing.copy(
            foodId = update.foodId ?: existing.foodId,
            recipeId = update.recipeId ?: existing.recipeId,
            mealType = update.mealType ?: existing.mealType,
            servings = update.servings ?: existing.servings,
            date = update.date ?: existing.date,
            notes = update.notes ?: existing.notes,
            quickName = update.quickName ?: existing.quickName,
            quickCalories = update.quickCalories ?: existing.quickCalories,
            quickProtein = update.quickProtein ?: existing.quickProtein,
            quickCarbs = update.quickCarbs ?: existing.quickCarbs,
            quickFat = update.quickFat ?: existing.quickFat,
            quickFiber = update.quickFiber ?: existing.quickFiber,
            eatenAt = update.eatenAt ?: existing.eatenAt,
        )
}
