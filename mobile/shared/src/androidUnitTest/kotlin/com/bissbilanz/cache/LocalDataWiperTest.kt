package com.bissbilanz.cache

import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.test.appModeManager
import com.bissbilanz.test.inMemoryCacheDatabase
import com.bissbilanz.test.inMemoryUserDataDatabase
import com.bissbilanz.userdata.UserDataDatabase
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Deliberate logout must leave nothing behind: no user rows that could leak into the
 * next account, no queued uploads, no sync markers (including `migration_normalized`).
 */
class LocalDataWiperTest {
    private lateinit var db: UserDataDatabase
    private lateinit var cacheDb: BissbilanzDatabase
    private lateinit var syncQueue: SyncQueue
    private lateinit var wiper: LocalDataWiper
    private val json = Json { ignoreUnknownKeys = true }

    private val queries get() = db.userDataDatabaseQueries
    private val cacheQueries get() = cacheDb.bissbilanzDatabaseQueries

    @BeforeTest
    fun setup() {
        db = inMemoryUserDataDatabase()
        cacheDb = inMemoryCacheDatabase()
        syncQueue = SyncQueue(cacheDb, json, appModeManager())
        wiper = LocalDataWiper(db, cacheDb, syncQueue)
    }

    @Test
    fun wipeAllClearsEveryUserTableTheQueueAndAllSyncMeta() =
        runTest {
            seedEverything()

            wiper.wipeAll()

            assertTrue(queries.selectAllEntries().executeAsList().isEmpty())
            assertTrue(queries.selectAllFoods().executeAsList().isEmpty())
            assertNull(queries.selectGoals().executeAsOneOrNull())
            assertTrue(queries.selectAllRecipes().executeAsList().isEmpty())
            assertTrue(queries.selectAllSupplements().executeAsList().isEmpty())
            assertTrue(queries.selectAllSupplementLogs().executeAsList().isEmpty())
            assertTrue(queries.selectAllWeightEntries().executeAsList().isEmpty())
            assertTrue(queries.selectAllSleepEntries().executeAsList().isEmpty())
            assertNull(queries.selectPreferences().executeAsOneOrNull())
            assertTrue(queries.selectAllDayProperties().executeAsList().isEmpty())
            assertEquals(0L, syncQueue.pendingCount())
            assertTrue(cacheQueries.selectAllMealTypes().executeAsList().isEmpty())
            // The one-shot migration marker is gone together with all other sync meta.
            assertNull(cacheQueries.selectSyncMeta("migration_normalized").executeAsOneOrNull())
            assertNull(cacheQueries.selectSyncMeta("foods").executeAsOneOrNull())
        }

    private suspend fun seedEverything() {
        queries.insertEntry(
            id = "e1",
            date = "2024-01-15",
            mealType = "lunch",
            servings = 1.0,
            foodId = "f1",
            recipeId = null,
            foodName = "Rice",
            calories = 130.0,
            protein = 2.7,
            carbs = 28.0,
            fat = 0.3,
            fiber = 0.4,
            jsonData = "{}",
        )
        queries.insertFood(
            id = "f1",
            name = "Rice",
            brand = null,
            calories = 130.0,
            protein = 2.7,
            carbs = 28.0,
            fat = 0.3,
            fiber = 0.4,
            isFavorite = 0L,
            barcode = null,
            jsonData = "{}",
        )
        queries.insertGoals(2000.0, 150.0, 250.0, 65.0, 30.0)
        queries.insertRecipe(
            id = "r1",
            name = "Bowl",
            totalServings = 2.0,
            isFavorite = 0L,
            calories = 100.0,
            protein = 10.0,
            carbs = 12.0,
            fat = 5.0,
            fiber = 2.0,
            jsonData = "{}",
        )
        queries.insertSupplement(id = "s1", name = "Iron", isActive = 1L, sortOrder = 0L, jsonData = "{}")
        queries.insertSupplementLog(id = "s1-2024-01-15", supplementId = "s1", date = "2024-01-15", takenAt = "t")
        queries.insertWeightEntry(id = "w1", entryDate = "2024-01-15", weightKg = 80.0, loggedAt = null, jsonData = "{}")
        queries.insertSleepEntry(
            id = "sl1",
            entryDate = "2024-01-15",
            durationMinutes = 480L,
            quality = 4L,
            loggedAt = null,
            jsonData = "{}",
        )
        queries.insertPreferences("{}")
        queries.upsertDayProperties("2024-01-15", 1L)
        syncQueue.enqueue(SyncOperation.DeleteEntry("e1"))
        cacheQueries.insertMealType(id = "m1", name = "Brunch", sortOrder = 0L)
        cacheQueries.upsertSyncMeta("migration_normalized", "2024-01-15T00:00:00Z")
        cacheQueries.upsertSyncMeta("foods", "2024-01-15T00:00:00Z")
    }
}
