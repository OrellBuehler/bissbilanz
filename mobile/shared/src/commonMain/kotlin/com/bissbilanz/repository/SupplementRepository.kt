package com.bissbilanz.repository

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.FoodCreate
import com.bissbilanz.api.generated.model.Supplement
import com.bissbilanz.api.generated.model.SupplementBackingFood
import com.bissbilanz.api.generated.model.SupplementCreate
import com.bissbilanz.api.generated.model.SupplementIngredient
import com.bissbilanz.api.generated.model.SupplementIngredientInput
import com.bissbilanz.api.generated.model.SupplementLog
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.model.SupplementHistoryEntry
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

// The server-side SupplementLog no longer carries a row id — it's derived from
// food_entries keyed by (supplementId, date). The local SQLDelight cache still
// wants a primary key, so we synthesize one from the natural key.
private fun cacheKeyFor(
    supplementId: String,
    date: String,
): String = "$supplementId-$date"

class SupplementRepository(
    private val api: BissbilanzApi,
    private val db: UserDataDatabase,
    private val cacheDb: BissbilanzDatabase,
    private val syncQueue: SyncQueue,
    private val json: Json,
    private val errorReporter: ErrorReporter,
    private val appModeManager: AppModeManager,
) {
    fun supplements(): Flow<List<Supplement>> =
        db.userDataDatabaseQueries
            .selectActiveSupplements()
            .asFlow()
            .mapToList(Dispatchers.IO)
            .map { rows -> rows.mapNotNull { json.decodeOrNull<Supplement>(it.jsonData) } }

    suspend fun refresh() {
        if (appModeManager.isLocal) return
        val supplements = api.getSupplements()
        cacheSupplements(supplements)
    }

    suspend fun createSupplement(supplement: SupplementCreate): Supplement {
        val temp = supplementCreateToSupplement(supplement)
        cacheSupplement(temp)
        syncQueue.enqueue(SyncOperation.CreateSupplement(json.encodeToString(supplement), localId = temp.id))
        return temp
    }

    suspend fun updateSupplement(
        id: String,
        supplement: SupplementCreate,
    ): Supplement {
        val temp = supplementCreateToSupplement(supplement, id)
        cacheSupplement(temp)
        if (id.isTempId()) {
            coalesceQueuedCreate(id, supplement)
        } else {
            syncQueue.enqueue(SyncOperation.UpdateSupplement(id, json.encodeToString(supplement)))
        }
        return temp
    }

    suspend fun deleteSupplement(id: String) {
        db.userDataDatabaseQueries.deleteSupplement(id)
        if (id.isTempId()) {
            syncQueue.removeByAffected("supplements", id)
        } else {
            syncQueue.enqueue(SyncOperation.DeleteSupplement(id))
        }
    }

    /**
     * Rewrites the still-queued Create operation for a temp-id supplement so the
     * eventual upload carries the edited values. Updates use the full
     * [SupplementCreate] body, so the new body simply replaces the queued one. If the
     * create has already been drained (no queued op found), the update is skipped —
     * the temp id is unknown server-side.
     */
    private suspend fun coalesceQueuedCreate(
        tempId: String,
        supplement: SupplementCreate,
    ) {
        syncQueue.rewriteQueuedCreate("supplements", tempId) { op ->
            val create = op as? SyncOperation.CreateSupplement ?: return@rewriteQueuedCreate null
            create.copy(body = json.encodeToString(supplement))
        }
    }

    suspend fun getChecklist(date: String): List<SupplementLog> {
        if (appModeManager.isLocal) return checklistFromCache(date)
        return try {
            val checklist = api.getSupplementChecklist(date)
            val logs =
                checklist.filter { it.taken }.map { item ->
                    SupplementLog(
                        supplementId = item.supplement.id,
                        date = date,
                        takenAt = item.takenAt ?: "",
                        entryIds = emptyList(),
                    )
                }
            logs.forEach { log ->
                db.userDataDatabaseQueries.insertSupplementLog(
                    id = cacheKeyFor(log.supplementId, log.date),
                    supplementId = log.supplementId,
                    date = log.date,
                    takenAt = log.takenAt,
                )
            }
            logs
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            checklistFromCache(date)
        }
    }

    private fun checklistFromCache(date: String): List<SupplementLog> =
        db.userDataDatabaseQueries
            .selectSupplementLogsByDate(date)
            .executeAsList()
            .map { log ->
                SupplementLog(
                    supplementId = log.supplementId,
                    date = log.date,
                    takenAt = log.takenAt,
                    entryIds = emptyList(),
                )
            }

    suspend fun logSupplement(
        supplementId: String,
        date: String?,
    ): SupplementLog {
        val now = Clock.System.now().toString()
        val logDate = date ?: now.substring(0, 10)
        val temp =
            SupplementLog(
                supplementId = supplementId,
                date = logDate,
                takenAt = now,
                entryIds = emptyList(),
            )
        db.userDataDatabaseQueries.insertSupplementLog(
            id = cacheKeyFor(temp.supplementId, temp.date),
            supplementId = temp.supplementId,
            date = temp.date,
            takenAt = temp.takenAt,
        )
        syncQueue.enqueue(SyncOperation.LogSupplement(supplementId, date))
        return temp
    }

    suspend fun unlogSupplement(
        supplementId: String,
        date: String,
    ) {
        db.userDataDatabaseQueries.deleteSupplementLog(supplementId, date)
        syncQueue.enqueue(SyncOperation.UnlogSupplement(supplementId, date))
    }

    suspend fun getHistory(
        from: String,
        to: String,
    ): List<SupplementHistoryEntry> {
        if (appModeManager.isLocal) return historyFromCache(from, to)
        return try {
            api.getSupplementHistory(from, to).history
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            historyFromCache(from, to)
        }
    }

    private fun historyFromCache(
        from: String,
        to: String,
    ): List<SupplementHistoryEntry> {
        val logs =
            db.userDataDatabaseQueries
                .selectSupplementLogsByDateRange(from, to)
                .executeAsList()
        val supplements =
            db.userDataDatabaseQueries
                .selectAllSupplements()
                .executeAsList()
                .mapNotNull { row -> json.decodeOrNull<Supplement>(row.jsonData)?.let { row.id to it } }
                .toMap()
        return logs.map { log ->
            val supplement = supplements[log.supplementId]
            SupplementHistoryEntry(
                supplementId = log.supplementId,
                supplementName = supplement?.name ?: "",
                date = log.date,
                takenAt = log.takenAt,
            )
        }
    }

    suspend fun getAllSupplements(): List<Supplement> {
        if (appModeManager.isLocal) {
            // The local DB is the primary store in Local mode; an empty list is the truth.
            return db.userDataDatabaseQueries
                .selectAllSupplements()
                .executeAsList()
                .mapNotNull { json.decodeOrNull<Supplement>(it.jsonData) }
        }
        return try {
            val all = api.getAllSupplements().supplements
            cacheSupplements(all, includeInactive = true)
            all
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            val cached = db.userDataDatabaseQueries.selectAllSupplements().executeAsList()
            if (cached.isNotEmpty()) {
                cached.mapNotNull { json.decodeOrNull<Supplement>(it.jsonData) }
            } else {
                throw e
            }
        }
    }

    private fun cacheSupplement(supplement: Supplement) {
        db.userDataDatabaseQueries.insertSupplement(
            id = supplement.id,
            name = supplement.name,
            isActive = if (supplement.isActive) 1L else 0L,
            sortOrder = supplement.sortOrder.toLong(),
            jsonData = json.encodeToString(supplement),
        )
    }

    private fun cacheSupplements(
        supplements: List<Supplement>,
        includeInactive: Boolean = false,
    ) {
        db.userDataDatabaseQueries.transaction {
            if (includeInactive) {
                db.userDataDatabaseQueries.deleteAllSupplements()
            }
            supplements.forEach { supplement -> cacheSupplement(supplement) }
        }
        // SyncMeta lives in the cache database; written after the user-data commit.
        cacheDb.bissbilanzDatabaseQueries.upsertSyncMeta(
            entityType = "supplements",
            lastSyncedAt = Clock.System.now().toString(),
        )
    }

    private fun supplementCreateToSupplement(
        supplement: SupplementCreate,
        id: String = newTempId(),
    ): Supplement =
        Supplement(
            id = id,
            userId = "",
            name = supplement.name,
            scheduleType = Supplement.ScheduleType.valueOf(supplement.scheduleType.name),
            scheduleDays = supplement.scheduleDays,
            scheduleStartDate = supplement.scheduleStartDate,
            isActive = supplement.isActive ?: true,
            sortOrder = supplement.sortOrder ?: 0,
            timeOfDay = supplement.timeOfDay?.let { Supplement.TimeOfDay.valueOf(it.name) },
            ingredients =
                supplement.ingredients.mapIndexed { index, input ->
                    input.toSupplementIngredient(supplementId = id, index = index)
                },
        )

    /**
     * Builds the cached ingredient from the create input. An inline `food` (no server
     * food exists yet — the server would create one) keeps its data embedded under a
     * synthesized temp food id; a `foodId` reference resolves the backing food from the
     * local food rows. The embedded copy is what the migrator uses to recreate inline
     * backing foods when uploading a locally created supplement.
     */
    private fun SupplementIngredientInput.toSupplementIngredient(
        supplementId: String,
        index: Int,
    ): SupplementIngredient {
        val resolvedFoodId = foodId ?: newTempId()
        val backingFood =
            food?.toBackingFood(resolvedFoodId)
                ?: localBackingFood(resolvedFoodId)
                ?: placeholderBackingFood(resolvedFoodId)
        return SupplementIngredient(
            id = newTempId(),
            supplementId = supplementId,
            foodId = resolvedFoodId,
            servings = servings ?: 1.0,
            sortOrder = sortOrder ?: index,
            food = backingFood,
        )
    }

    private fun FoodCreate.toBackingFood(id: String): SupplementBackingFood =
        SupplementBackingFood(
            id = id,
            name = name,
            brand = brand,
            kind = SupplementBackingFood.Kind.supplement,
            servingSize = servingSize,
            servingUnit = servingUnit.value,
            calories = calories,
            protein = protein,
            carbs = carbs,
            fat = fat,
            fiber = fiber,
            ingredientsText = ingredientsText,
        )

    private fun localBackingFood(foodId: String): SupplementBackingFood? {
        val row = db.userDataDatabaseQueries.selectFoodById(foodId).executeAsOneOrNull() ?: return null
        val food = json.decodeOrNull<Food>(row.jsonData) ?: return null
        return SupplementBackingFood(
            id = food.id,
            name = food.name,
            brand = food.brand,
            kind = SupplementBackingFood.Kind.food,
            servingSize = food.servingSize,
            servingUnit = food.servingUnit.value,
            calories = food.calories,
            protein = food.protein,
            carbs = food.carbs,
            fat = food.fat,
            fiber = food.fiber,
            ingredientsText = food.ingredientsText,
        )
    }

    private fun placeholderBackingFood(foodId: String): SupplementBackingFood =
        SupplementBackingFood(
            id = foodId,
            name = "",
            brand = null,
            kind = SupplementBackingFood.Kind.food,
            servingSize = 1.0,
            servingUnit = "g",
            calories = 0.0,
            protein = 0.0,
            carbs = 0.0,
            fat = 0.0,
            fiber = 0.0,
            ingredientsText = null,
        )
}
