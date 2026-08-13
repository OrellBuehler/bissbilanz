package com.bissbilanz.sync

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.OpenFoodFactsClient
import com.bissbilanz.api.generated.model.EntryCreate
import com.bissbilanz.api.generated.model.EntryUpdate
import com.bissbilanz.api.generated.model.FoodCreate
import com.bissbilanz.api.generated.model.RecipeCreate
import com.bissbilanz.api.generated.model.RecipeUpdate
import com.bissbilanz.api.generated.model.ServingUnit
import com.bissbilanz.api.generated.model.SleepCreate
import com.bissbilanz.api.generated.model.SleepUpdate
import com.bissbilanz.api.generated.model.SupplementCreate
import com.bissbilanz.api.generated.model.WeightCreate
import com.bissbilanz.api.generated.model.WeightUpdate
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.repository.RecipeRepository
import com.bissbilanz.repository.SleepRepository
import com.bissbilanz.repository.SupplementRepository
import com.bissbilanz.repository.WeightRepository
import com.bissbilanz.test.NoopErrorReporter
import com.bissbilanz.test.appModeManager
import com.bissbilanz.test.inMemoryCacheDatabase
import com.bissbilanz.test.inMemoryUserDataDatabase
import com.bissbilanz.userdata.UserDataDatabase
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Verifies that editing or deleting a record that only exists locally (a `temp_` id)
 * rewrites or removes the queued Create operation instead of leaving the original
 * payload to be uploaded.
 */
class TempIdCoalescingTest {
    private lateinit var api: BissbilanzApi
    private lateinit var db: UserDataDatabase
    private lateinit var cacheDb: BissbilanzDatabase
    private lateinit var syncQueue: SyncQueue
    private val json = Json { ignoreUnknownKeys = true }

    @BeforeTest
    fun setup() {
        api = mockk()
        db = inMemoryUserDataDatabase()
        cacheDb = inMemoryCacheDatabase()
        syncQueue = SyncQueue(cacheDb, json, appModeManager())
    }

    private fun entryRepository() = EntryRepository(api, db, cacheDb, syncQueue, json, NoopErrorReporter(), appModeManager())

    private fun foodRepository() =
        FoodRepository(
            api,
            db,
            cacheDb,
            syncQueue,
            json,
            NoopErrorReporter(),
            appModeManager(),
            mockk<OpenFoodFactsClient>(relaxed = true),
            Dispatchers.Unconfined,
        )

    private fun recipeRepository() = RecipeRepository(api, db, cacheDb, syncQueue, json, NoopErrorReporter(), appModeManager())

    private fun weightRepository() = WeightRepository(api, db, cacheDb, syncQueue, json, NoopErrorReporter(), appModeManager())

    private fun sleepRepository() = SleepRepository(api, db, cacheDb, syncQueue, json, NoopErrorReporter(), appModeManager())

    private fun supplementRepository() = SupplementRepository(api, db, cacheDb, syncQueue, json, NoopErrorReporter(), appModeManager())

    // Entries

    @Test
    fun entryCreateThenUpdateRewritesQueuedCreateBody() =
        runTest {
            val repo = entryRepository()
            val temp =
                repo.createEntry(
                    EntryCreate(mealType = "lunch", servings = 1.0, date = "2024-01-15", foodId = "f1"),
                )

            repo.updateEntry(temp.id, EntryUpdate(servings = 2.5, notes = "more rice"))

            val create = syncQueue.drain().single().operation as SyncOperation.CreateEntry
            assertEquals(temp.id, create.localId)
            val body = json.decodeFromString<EntryCreate>(create.body)
            assertEquals(2.5, body.servings)
            assertEquals("more rice", body.notes)
            assertEquals("lunch", body.mealType)
            assertEquals("f1", body.foodId)
            assertEquals("2024-01-15", body.date)
        }

    @Test
    fun entryCreateThenDeleteLeavesQueueEmpty() =
        runTest {
            val repo = entryRepository()
            val temp = repo.createEntry(EntryCreate(mealType = "lunch", servings = 1.0, date = "2024-01-15"))

            repo.deleteEntry(temp.id)

            assertEquals(0, syncQueue.pendingCount())
        }

    @Test
    fun entryUpdateOfTempIdWithNoQueuedCreateSkipsEnqueue() =
        runTest {
            val repo = entryRepository()
            val temp = repo.createEntry(EntryCreate(mealType = "lunch", servings = 1.0, date = "2024-01-15"))
            // Simulate the create having already been drained and synced.
            syncQueue.remove(syncQueue.drain().single().id)

            repo.updateEntry(temp.id, EntryUpdate(servings = 3.0))

            assertEquals(0, syncQueue.pendingCount())
        }

    @Test
    fun entryUpdateAndDeleteOfServerIdsEnqueueOperationsAsBefore() =
        runTest {
            val repo = entryRepository()

            repo.updateEntry("server-1", EntryUpdate(servings = 2.0))
            repo.deleteEntry("server-2")

            val ops = syncQueue.drain().map { it.operation }
            assertTrue(ops.any { it is SyncOperation.UpdateEntry && it.id == "server-1" })
            assertTrue(ops.any { it is SyncOperation.DeleteEntry && it.id == "server-2" })
        }

    // Foods

    @Test
    fun foodCreateThenUpdateReplacesQueuedCreateBody() =
        runTest {
            val repo = foodRepository()
            val temp = repo.createFood(foodCreate(name = "Rice"))

            repo.updateFood(temp.id, foodCreate(name = "Brown Rice", calories = 111.0))

            val create = syncQueue.drain().single().operation as SyncOperation.CreateFood
            assertEquals(temp.id, create.localId)
            val body = json.decodeFromString<FoodCreate>(create.body)
            assertEquals("Brown Rice", body.name)
            assertEquals(111.0, body.calories)
        }

    @Test
    fun foodCreateThenDeleteLeavesQueueEmpty() =
        runTest {
            val repo = foodRepository()
            val temp = repo.createFood(foodCreate())

            repo.deleteFood(temp.id)

            assertEquals(0, syncQueue.pendingCount())
        }

    @Test
    fun foodUpdateAndDeleteOfServerIdsEnqueueOperationsAsBefore() =
        runTest {
            val repo = foodRepository()

            repo.updateFood("server-1", foodCreate(name = "Updated"))
            repo.deleteFood("server-2")

            val ops = syncQueue.drain().map { it.operation }
            assertTrue(ops.any { it is SyncOperation.UpdateFood && it.id == "server-1" })
            assertTrue(ops.any { it is SyncOperation.DeleteFood && it.id == "server-2" })
        }

    // Recipes

    @Test
    fun recipeCreateThenUpdateRewritesQueuedCreateBody() =
        runTest {
            val repo = recipeRepository()
            val temp = repo.createRecipe(RecipeCreate(name = "Soup", totalServings = 4.0, ingredients = emptyList()))

            repo.updateRecipe(temp.id, RecipeUpdate(name = "Hot Soup"))

            val create = syncQueue.drain().single().operation as SyncOperation.CreateRecipe
            assertEquals(temp.id, create.localId)
            val body = json.decodeFromString<RecipeCreate>(create.body)
            assertEquals("Hot Soup", body.name)
            assertEquals(4.0, body.totalServings)
        }

    @Test
    fun recipeCreateThenDeleteLeavesQueueEmpty() =
        runTest {
            val repo = recipeRepository()
            val temp = repo.createRecipe(RecipeCreate(name = "Soup", totalServings = 4.0, ingredients = emptyList()))

            repo.deleteRecipe(temp.id)

            assertEquals(0, syncQueue.pendingCount())
        }

    @Test
    fun recipeUpdateAndDeleteOfServerIdsEnqueueOperationsAsBefore() =
        runTest {
            val repo = recipeRepository()

            repo.updateRecipe("server-1", RecipeUpdate(name = "Updated"))
            repo.deleteRecipe("server-2")

            val ops = syncQueue.drain().map { it.operation }
            assertTrue(ops.any { it is SyncOperation.UpdateRecipe && it.id == "server-1" })
            assertTrue(ops.any { it is SyncOperation.DeleteRecipe && it.id == "server-2" })
        }

    // Weight

    @Test
    fun weightCreateThenUpdateRewritesQueuedCreateBody() =
        runTest {
            val repo = weightRepository()
            val temp = repo.createEntry(WeightCreate(weightKg = 80.0, entryDate = "2024-01-15", notes = "morning"))

            repo.updateEntry(temp.id, WeightUpdate(weightKg = 79.5))

            val create = syncQueue.drain().single().operation as SyncOperation.CreateWeight
            assertEquals(temp.id, create.localId)
            val body = json.decodeFromString<WeightCreate>(create.body)
            assertEquals(79.5, body.weightKg)
            assertEquals("2024-01-15", body.entryDate)
            assertEquals("morning", body.notes)
        }

    @Test
    fun weightCreateThenDeleteLeavesQueueEmpty() =
        runTest {
            val repo = weightRepository()
            val temp = repo.createEntry(WeightCreate(weightKg = 80.0, entryDate = "2024-01-15"))

            repo.deleteEntry(temp.id)

            assertEquals(0, syncQueue.pendingCount())
        }

    @Test
    fun weightUpdateAndDeleteOfServerIdsEnqueueOperationsAsBefore() =
        runTest {
            val repo = weightRepository()

            repo.updateEntry("server-1", WeightUpdate(weightKg = 81.0))
            repo.deleteEntry("server-2")

            val ops = syncQueue.drain().map { it.operation }
            assertTrue(ops.any { it is SyncOperation.UpdateWeight && it.id == "server-1" })
            assertTrue(ops.any { it is SyncOperation.DeleteWeight && it.id == "server-2" })
        }

    // Sleep

    @Test
    fun sleepCreateThenUpdateRewritesQueuedCreateBody() =
        runTest {
            val repo = sleepRepository()
            val temp = repo.createEntry(SleepCreate(durationMinutes = 480, quality = 7.0, entryDate = "2024-01-15"))

            repo.updateEntry(temp.id, SleepUpdate(quality = 9.0, notes = "slept well"))

            val create = syncQueue.drain().single().operation as SyncOperation.CreateSleep
            assertEquals(temp.id, create.localId)
            val body = json.decodeFromString<SleepCreate>(create.body)
            assertEquals(9.0, body.quality)
            assertEquals(480, body.durationMinutes)
            assertEquals("2024-01-15", body.entryDate)
            assertEquals("slept well", body.notes)
        }

    @Test
    fun sleepCreateThenDeleteLeavesQueueEmpty() =
        runTest {
            val repo = sleepRepository()
            val temp = repo.createEntry(SleepCreate(durationMinutes = 480, quality = 7.0, entryDate = "2024-01-15"))

            repo.deleteEntry(temp.id)

            assertEquals(0, syncQueue.pendingCount())
        }

    @Test
    fun sleepUpdateAndDeleteOfServerIdsEnqueueOperationsAsBefore() =
        runTest {
            val repo = sleepRepository()

            repo.updateEntry("server-1", SleepUpdate(quality = 8.0))
            repo.deleteEntry("server-2")

            val ops = syncQueue.drain().map { it.operation }
            assertTrue(ops.any { it is SyncOperation.UpdateSleep && it.id == "server-1" })
            assertTrue(ops.any { it is SyncOperation.DeleteSleep && it.id == "server-2" })
        }

    // Supplements

    @Test
    fun supplementCreateThenUpdateReplacesQueuedCreateBody() =
        runTest {
            val repo = supplementRepository()
            val temp = repo.createSupplement(supplementCreate(name = "Magnesium"))

            repo.updateSupplement(temp.id, supplementCreate(name = "Magnesium Citrate"))

            val create = syncQueue.drain().single().operation as SyncOperation.CreateSupplement
            assertEquals(temp.id, create.localId)
            val body = json.decodeFromString<SupplementCreate>(create.body)
            assertEquals("Magnesium Citrate", body.name)
        }

    @Test
    fun supplementCreateThenDeleteLeavesQueueEmpty() =
        runTest {
            val repo = supplementRepository()
            val temp = repo.createSupplement(supplementCreate())

            repo.deleteSupplement(temp.id)

            assertEquals(0, syncQueue.pendingCount())
        }

    @Test
    fun supplementUpdateAndDeleteOfServerIdsEnqueueOperationsAsBefore() =
        runTest {
            val repo = supplementRepository()

            repo.updateSupplement("server-1", supplementCreate(name = "Updated"))
            repo.deleteSupplement("server-2")

            val ops = syncQueue.drain().map { it.operation }
            assertTrue(ops.any { it is SyncOperation.UpdateSupplement && it.id == "server-1" })
            assertTrue(ops.any { it is SyncOperation.DeleteSupplement && it.id == "server-2" })
        }

    private fun foodCreate(
        name: String = "Rice",
        calories: Double = 130.0,
    ) = FoodCreate(
        name = name,
        servingSize = 100.0,
        servingUnit = ServingUnit.g,
        calories = calories,
        protein = 2.7,
        carbs = 28.0,
        fat = 0.3,
        fiber = 0.4,
    )

    private fun supplementCreate(name: String = "Magnesium") =
        SupplementCreate(
            name = name,
            scheduleType = SupplementCreate.ScheduleType.daily,
            ingredients = emptyList(),
        )
}
