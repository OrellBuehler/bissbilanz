package com.bissbilanz.sync

import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import com.bissbilanz.api.ApiException
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.UnauthorizedException
import com.bissbilanz.api.generated.model.DayProperties
import com.bissbilanz.api.generated.model.EntryCreate
import com.bissbilanz.api.generated.model.FoodCreate
import com.bissbilanz.api.generated.model.RecipeCreate
import com.bissbilanz.api.generated.model.RecipeDetail
import com.bissbilanz.api.generated.model.RecipeIngredient
import com.bissbilanz.api.generated.model.RecipeIngredientInput
import com.bissbilanz.api.generated.model.ServingUnit
import com.bissbilanz.api.generated.model.Supplement
import com.bissbilanz.api.generated.model.SupplementCreate
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.mode.AppMode
import com.bissbilanz.model.Entry
import com.bissbilanz.test.NoopErrorReporter
import com.bissbilanz.test.TestFixtures
import com.bissbilanz.test.appModeManager
import com.bissbilanz.test.inMemoryUserDataDatabase
import com.bissbilanz.userdata.UserDataDatabase
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SyncManagerTest {
    private lateinit var api: BissbilanzApi
    private lateinit var db: BissbilanzDatabase
    private lateinit var userDb: UserDataDatabase
    private lateinit var syncQueue: SyncQueue
    private lateinit var connectivityProvider: ConnectivityProvider
    private lateinit var manager: SyncManager
    private val json = Json { ignoreUnknownKeys = true }
    private val isOnline = MutableStateFlow(true)

    @BeforeTest
    fun setup() {
        api = mockk()
        val driver = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
        BissbilanzDatabase.Schema.create(driver)
        db = BissbilanzDatabase(driver)
        userDb = inMemoryUserDataDatabase()
        syncQueue = SyncQueue(db, json, appModeManager())
        connectivityProvider = mockk()
        every { connectivityProvider.isOnline } returns isOnline
        manager = SyncManager(syncQueue, connectivityProvider, api, userDb, json, NoopErrorReporter(), appModeManager())
    }

    @Test
    fun syncDrainsQueueAndExecutesEachOperation() =
        runTest {
            syncQueue.enqueue(SyncOperation.CreateFood(json.encodeToString(foodCreate()), localId = "temp_1"))
            syncQueue.enqueue(SyncOperation.DeleteEntry("e1"))
            coEvery { api.createFood(any(), any(), any()) } returns TestFixtures.food()
            coEvery { api.deleteEntry("e1", any(), any()) } returns Unit

            val synced = manager.syncPendingQueue()

            assertEquals(2, synced)
            assertEquals(0, syncQueue.pendingCount())
            coVerify { api.createFood(match { it.name == "Rice" }, any(), any()) }
            coVerify { api.deleteEntry("e1", any(), any()) }
            assertTrue(
                manager.state.value.errors
                    .isEmpty(),
            )
        }

    @Test
    fun clientErrorDropsOperationAndRecordsError() =
        runTest {
            syncQueue.enqueue(SyncOperation.DeleteEntry("e1"))
            coEvery { api.deleteEntry("e1", any(), any()) } throws ApiException("bad request", 400)

            val synced = manager.syncPendingQueue()

            assertEquals(1, synced)
            assertEquals(0, syncQueue.pendingCount())
            assertTrue(
                manager.state.value.errors
                    .single()
                    .contains("HTTP 400"),
            )
        }

    @Test
    fun serverErrorBacksOffAndGivesUpAfterMaxRetries() =
        runTest {
            syncQueue.enqueue(SyncOperation.DeleteEntry("e1"))
            coEvery { api.deleteEntry(any(), any(), any()) } throws ApiException("server error", 500)

            // Attempts 1-4: each syncPendingQueue picks the item (nextAttemptAt reset to 0),
            // hits 5xx, schedules backoff, releases. Returns 0 synced each time.
            var itemId: Long = -1
            repeat(4) { attempt ->
                if (attempt > 0) {
                    // Reset backoff so the drain sees the item again.
                    syncQueue.setNextAttemptAt(itemId, 0)
                }
                assertEquals(0, manager.syncPendingQueue())
                assertEquals(1, syncQueue.pendingCount())
                if (attempt == 0) {
                    itemId = syncQueue.all().single().id
                }
            }

            // Attempt 5: hits the MAX_RETRIES cap, drops the item.
            syncQueue.setNextAttemptAt(itemId, 0)
            val last = manager.syncPendingQueue()

            assertEquals(1, last)
            assertEquals(0, syncQueue.pendingCount())
            assertTrue(
                manager.state.value.errors
                    .single()
                    .contains("Gave up"),
            )
            coVerify(exactly = 5) { api.deleteEntry(any(), any(), any()) }
        }

    @Test
    fun unauthorizedReleasesOperationsAndStopsSyncing() =
        runTest {
            syncQueue.enqueue(SyncOperation.DeleteEntry("e1"))
            syncQueue.enqueue(SyncOperation.DeleteEntry("e2"))
            coEvery { api.deleteEntry(any(), any(), any()) } throws UnauthorizedException()

            val synced = manager.syncPendingQueue()

            assertEquals(0, synced)
            assertEquals(2, syncQueue.pendingCount())
            coVerify(exactly = 1) { api.deleteEntry(any(), any(), any()) }
            assertTrue(
                manager.state.value.errors
                    .single()
                    .contains("Session expired"),
            )
        }

    @Test
    fun offlineSkipsSyncAndKeepsQueue() =
        runTest {
            isOnline.value = false
            syncQueue.enqueue(SyncOperation.DeleteEntry("e1"))

            val synced = manager.syncPendingQueue()

            assertEquals(0, synced)
            assertEquals(1, syncQueue.pendingCount())
        }

    @Test
    fun localModeReturnsZeroWithoutTouchingApiOrQueue() =
        runTest {
            // Pre-existing queued op (e.g. enqueued before switching to Local mode).
            syncQueue.enqueue(SyncOperation.DeleteEntry("e1"))
            val localManager =
                SyncManager(
                    syncQueue,
                    connectivityProvider,
                    api,
                    userDb,
                    json,
                    NoopErrorReporter(),
                    appModeManager(AppMode.LOCAL),
                )

            val synced = localManager.syncPendingQueue()

            assertEquals(0, synced)
            assertEquals(1, syncQueue.pendingCount())
            coVerify(exactly = 0) { api.deleteEntry(any(), any(), any()) }
        }

    @Test
    fun executesSetDayPropertiesViaApi() =
        runTest {
            syncQueue.enqueue(SyncOperation.SetDayProperties("2024-01-15", isFastingDay = true))
            coEvery { api.setDayProperties("2024-01-15", true, any(), any()) } returns
                DayProperties(date = "2024-01-15", isFastingDay = true)

            val synced = manager.syncPendingQueue()

            assertEquals(1, synced)
            assertEquals(0, syncQueue.pendingCount())
            coVerify { api.setDayProperties("2024-01-15", true, any(), any()) }
        }

    @Test
    fun executesDeleteDayPropertiesViaApi() =
        runTest {
            syncQueue.enqueue(SyncOperation.DeleteDayProperties("2024-01-15"))
            coEvery { api.deleteDayProperties("2024-01-15", any(), any()) } returns Unit

            val synced = manager.syncPendingQueue()

            assertEquals(1, synced)
            assertEquals(0, syncQueue.pendingCount())
            coVerify { api.deleteDayProperties("2024-01-15", any(), any()) }
        }

    // ------------------------------------------------------------------------------
    // Temp-id remapping when creates drain (offline create → reference chains)
    // ------------------------------------------------------------------------------

    /** Inserts directly with an explicit timestamp so drain order is deterministic. */
    private fun enqueueAt(
        operation: SyncOperation,
        createdAt: Long,
    ) {
        db.bissbilanzDatabaseQueries.insertSyncQueueItem(
            operation = json.encodeToString(SyncOperation.serializer(), operation),
            createdAt = createdAt,
            affectedTable = operation.affectedTable,
            affectedId = operation.affectedId,
            idempotencyKey = null,
            clientEditedAt = null,
        )
    }

    @Test
    fun offlineCreateFoodThenEntryChainDrainsWithServerFoodId() =
        runTest {
            enqueueAt(SyncOperation.CreateFood(json.encodeToString(foodCreate()), localId = "temp_f1"), createdAt = 1)
            enqueueAt(
                SyncOperation.CreateEntry(
                    json.encodeToString(
                        EntryCreate(mealType = "lunch", servings = 1.0, date = "2024-01-15", foodId = "temp_f1"),
                    ),
                    localId = "temp_e1",
                ),
                createdAt = 2,
            )
            coEvery { api.createFood(any(), any(), any()) } returns TestFixtures.food(id = "srv-food-1")
            val entryCreates = mutableListOf<EntryCreate>()
            coEvery { api.createEntry(capture(entryCreates), any(), any()) } returns serverEntry("srv-entry-1", foodId = "srv-food-1")

            val synced = manager.syncPendingQueue()

            assertEquals(2, synced)
            assertEquals(0, syncQueue.pendingCount())
            // The entry was posted with the SERVER food id, not the temp id.
            assertEquals("srv-food-1", entryCreates.single().foodId)
            assertTrue(
                manager.state.value.errors
                    .isEmpty(),
            )
        }

    @Test
    fun createFoodDrainReplacesLocalTempRowWithServerRecord() =
        runTest {
            userDb.userDataDatabaseQueries.insertFood(
                id = "temp_f1",
                name = "Rice",
                brand = null,
                calories = 130.0,
                protein = 2.7,
                carbs = 28.0,
                fat = 0.3,
                fiber = 0.4,
                isFavorite = 0L,
                barcode = null,
                jsonData = json.encodeToString(TestFixtures.food(id = "temp_f1", name = "Rice")),
            )
            syncQueue.enqueue(SyncOperation.CreateFood(json.encodeToString(foodCreate()), localId = "temp_f1"))
            coEvery { api.createFood(any(), any(), any()) } returns TestFixtures.food(id = "srv-food-1", name = "Rice")

            manager.syncPendingQueue()

            assertNull(userDb.userDataDatabaseQueries.selectFoodById("temp_f1").executeAsOneOrNull())
            val server = userDb.userDataDatabaseQueries.selectFoodById("srv-food-1").executeAsOneOrNull()
            assertNotNull(server)
            assertEquals("srv-food-1", json.decodeFromString<com.bissbilanz.api.generated.model.Food>(server.jsonData).id)
        }

    @Test
    fun createFoodDrainRemapsQueuedUpdateDeleteAndRecipeIngredientReferences() =
        runTest {
            enqueueAt(SyncOperation.CreateFood(json.encodeToString(foodCreate()), localId = "temp_f1"), createdAt = 1)
            enqueueAt(SyncOperation.UpdateFood("temp_f1", json.encodeToString(foodCreate(name = "Brown Rice"))), createdAt = 2)
            enqueueAt(SyncOperation.DeleteFood("temp_f1"), createdAt = 3)
            enqueueAt(
                SyncOperation.CreateRecipe(
                    json.encodeToString(
                        RecipeCreate(
                            name = "Bowl",
                            totalServings = 2.0,
                            ingredients = listOf(RecipeIngredientInput("temp_f1", 100.0, ServingUnit.g)),
                        ),
                    ),
                    localId = "temp_r1",
                ),
                createdAt = 4,
            )
            coEvery { api.createFood(any(), any(), any()) } returns TestFixtures.food(id = "srv-food-1")
            coEvery { api.updateFood(any(), any(), any(), any()) } returns TestFixtures.food(id = "srv-food-1", name = "Brown Rice")
            coEvery { api.deleteFood(any(), any(), any()) } returns Unit
            val recipeCreates = mutableListOf<RecipeCreate>()
            coEvery { api.createRecipe(capture(recipeCreates), any(), any()) } returns recipeDetail("srv-recipe-1", foodId = "srv-food-1")

            val synced = manager.syncPendingQueue()

            assertEquals(4, synced)
            assertEquals(0, syncQueue.pendingCount())
            coVerify { api.updateFood("srv-food-1", match { it.name == "Brown Rice" }, any(), any()) }
            coVerify { api.deleteFood("srv-food-1", any(), any()) }
            assertEquals(listOf("srv-food-1"), recipeCreates.single().ingredients.map { it.foodId })
        }

    @Test
    fun createSupplementDrainRemapsQueuedLogAndLocalLogRows() =
        runTest {
            userDb.userDataDatabaseQueries.insertSupplementLog(
                id = "temp_s1-2024-01-15",
                supplementId = "temp_s1",
                date = "2024-01-15",
                takenAt = "2024-01-15T08:00:00Z",
            )
            enqueueAt(
                SyncOperation.CreateSupplement(
                    json.encodeToString(
                        SupplementCreate(
                            name = "Magnesium",
                            scheduleType = SupplementCreate.ScheduleType.daily,
                            ingredients = emptyList(),
                        ),
                    ),
                    localId = "temp_s1",
                ),
                createdAt = 1,
            )
            enqueueAt(SyncOperation.LogSupplement("temp_s1", "2024-01-15"), createdAt = 2)
            coEvery { api.createSupplement(any(), any(), any()) } returns supplement("srv-supp-1")
            coEvery { api.logSupplement(any(), any(), any(), any()) } returns
                com.bissbilanz.api.generated.model.SupplementLog(
                    supplementId = "srv-supp-1",
                    date = "2024-01-15",
                    takenAt = "2024-01-15T08:00:00Z",
                    entryIds = emptyList(),
                )

            val synced = manager.syncPendingQueue()

            assertEquals(2, synced)
            coVerify { api.logSupplement("srv-supp-1", "2024-01-15", any(), any()) }
            // Local log rows were re-keyed onto the server supplement id.
            val logs = userDb.userDataDatabaseQueries.selectAllSupplementLogs().executeAsList()
            assertEquals(listOf("srv-supp-1-2024-01-15"), logs.map { it.id })
            assertEquals(listOf("srv-supp-1"), logs.map { it.supplementId })
        }

    @Test
    fun remappedReferencesArePersistedForRetriesAcrossSyncRuns() =
        runTest {
            enqueueAt(SyncOperation.CreateFood(json.encodeToString(foodCreate()), localId = "temp_f1"), createdAt = 1)
            enqueueAt(
                SyncOperation.CreateEntry(
                    json.encodeToString(
                        EntryCreate(mealType = "lunch", servings = 1.0, date = "2024-01-15", foodId = "temp_f1"),
                    ),
                    localId = "temp_e1",
                ),
                createdAt = 2,
            )
            coEvery { api.createFood(any(), any(), any()) } returns TestFixtures.food(id = "srv-food-1")
            coEvery { api.createEntry(any(), any(), any()) } throws ApiException("server error", 500)

            assertEquals(1, manager.syncPendingQueue())

            // The queued entry row itself was rewritten, so the retry succeeds even
            // though the in-memory remap of the first run is gone.
            val queuedEntry = syncQueue.all().single().operation as SyncOperation.CreateEntry
            assertEquals("srv-food-1", json.decodeFromString<EntryCreate>(queuedEntry.body).foodId)

            // Reset backoff so the retry drains immediately in the test.
            syncQueue.setNextAttemptAt(syncQueue.all().single().id, 0)

            val entryCreates = mutableListOf<EntryCreate>()
            coEvery { api.createEntry(capture(entryCreates), any(), any()) } returns serverEntry("srv-entry-1", foodId = "srv-food-1")

            assertEquals(1, manager.syncPendingQueue())
            assertEquals(0, syncQueue.pendingCount())
            assertEquals("srv-food-1", entryCreates.single().foodId)
        }

    @Test
    fun remapRewritesAffectedIdSoCoalescingKeysStayConsistent() =
        runTest {
            enqueueAt(SyncOperation.CreateFood(json.encodeToString(foodCreate()), localId = "temp_f1"), createdAt = 1)
            enqueueAt(SyncOperation.UpdateFood("temp_f1", json.encodeToString(foodCreate(name = "Brown Rice"))), createdAt = 2)
            coEvery { api.createFood(any(), any(), any()) } returns TestFixtures.food(id = "srv-food-1")
            coEvery { api.updateFood(any(), any(), any(), any()) } throws ApiException("server error", 500)

            manager.syncPendingQueue()

            val remaining = syncQueue.findByAffected("foods", "srv-food-1")
            assertEquals(1, remaining.size)
            assertEquals("srv-food-1", (remaining.single().operation as SyncOperation.UpdateFood).id)
            assertTrue(syncQueue.findByAffected("foods", "temp_f1").isEmpty())
        }

    private fun serverEntry(
        id: String,
        foodId: String? = null,
    ) = Entry(
        id = id,
        userId = "user-1",
        foodId = foodId,
        date = "2024-01-15",
        mealType = "lunch",
        servings = 1.0,
    )

    private fun recipeDetail(
        id: String,
        foodId: String,
    ) = RecipeDetail(
        id = id,
        userId = "user-1",
        name = "Bowl",
        totalServings = 2.0,
        isFavorite = false,
        imageUrl = null,
        calories = 100.0,
        protein = 10.0,
        carbs = 12.0,
        fat = 5.0,
        fiber = 2.0,
        ingredients =
            listOf(
                RecipeIngredient(
                    foodId = foodId,
                    quantity = 100.0,
                    servingUnit = RecipeIngredient.ServingUnit.g,
                    sortOrder = 0,
                ),
            ),
    )

    private fun supplement(id: String) =
        Supplement(
            id = id,
            userId = "user-1",
            name = "Magnesium",
            scheduleType = Supplement.ScheduleType.daily,
            scheduleDays = null,
            scheduleStartDate = null,
            isActive = true,
            sortOrder = 0,
            timeOfDay = null,
            ingredients = emptyList(),
        )

    private fun foodCreate(name: String = "Rice") =
        FoodCreate(
            name = name,
            servingSize = 100.0,
            servingUnit = ServingUnit.g,
            calories = 130.0,
            protein = 2.7,
            carbs = 28.0,
            fat = 0.3,
            fiber = 0.4,
        )
}
