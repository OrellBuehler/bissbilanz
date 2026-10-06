package com.bissbilanz.sync

import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import com.bissbilanz.api.ApiException
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.EntryCreate
import com.bissbilanz.api.generated.model.RecipeCreate
import com.bissbilanz.api.generated.model.RecipeDetail
import com.bissbilanz.api.generated.model.RecipeIngredientInput
import com.bissbilanz.api.generated.model.ServingUnit
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.test.NoopErrorReporter
import com.bissbilanz.test.TestFixtures
import com.bissbilanz.test.appModeManager
import com.bissbilanz.test.inMemoryUserDataDatabase
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

class BulkFoodGateTest {
    private val json = Json { ignoreUnknownKeys = true }
    private lateinit var api: BissbilanzApi
    private lateinit var syncQueue: SyncQueue
    private lateinit var manager: SyncManager
    private val calls = mutableListOf<String>()
    private var gateFailure: Exception? = null
    private val gated = mutableListOf<Set<String>>()

    @BeforeTest
    fun setup() {
        api = mockk()
        val driver = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
        BissbilanzDatabase.Schema.create(driver)
        val db = BissbilanzDatabase(driver)
        syncQueue = SyncQueue(db, json, appModeManager())
        val connectivity = mockk<ConnectivityProvider>()
        every { connectivity.isOnline } returns MutableStateFlow(true)
        manager = SyncManager(syncQueue, connectivity, api, inMemoryUserDataDatabase(), json, NoopErrorReporter(), appModeManager())
        manager.bulkFoodGate =
            BulkFoodGate { ids ->
                calls.add("gate")
                gated.add(ids)
                gateFailure?.let { throw it }
            }
        coEvery { api.createEntry(any(), any(), any()) } answers {
            calls.add("createEntry")
            TestFixtures.entry()
        }
        coEvery { api.createRecipe(any(), any(), any()) } answers {
            calls.add("createRecipe")
            RecipeDetail(
                id = "srv-recipe",
                userId = "user-1",
                name = "Soup",
                totalServings = 2.0,
                isFavorite = false,
                imageUrl = null,
                calories = 1.0,
                protein = 1.0,
                carbs = 1.0,
                fat = 1.0,
                fiber = 1.0,
                ingredients = emptyList(),
            )
        }
    }

    private suspend fun queueEntry(foodId: String?) {
        syncQueue.enqueue(
            SyncOperation.CreateEntry(
                json.encodeToString(
                    EntryCreate(
                        mealType = "lunch",
                        servings = 1.0,
                        date = "2026-10-06",
                        foodId = foodId,
                        quickName =
                            if (foodId ==
                                null
                            ) {
                                "Quick"
                            } else {
                                null
                            },
                    ),
                ),
                localId = "temp_e1",
            ),
        )
    }

    @Test
    fun aDiaryEntryWaitsForTheBulkFoodItPointsAt() =
        runTest {
            queueEntry("bulk-food")

            manager.syncPendingQueue()

            assertEquals(listOf("gate", "createEntry"), calls)
            assertEquals(listOf(setOf("bulk-food")), gated)
        }

    @Test
    fun aRecipeWaitsForItsBulkIngredients() =
        runTest {
            val recipe =
                RecipeCreate(
                    name = "Soup",
                    totalServings = 2.0,
                    ingredients =
                        listOf(
                            RecipeIngredientInput(foodId = "a", quantity = 1.0, servingUnit = ServingUnit.g),
                            RecipeIngredientInput(foodId = "b", quantity = 1.0, servingUnit = ServingUnit.g),
                        ),
                )
            syncQueue.enqueue(SyncOperation.CreateRecipe(json.encodeToString(recipe), localId = "temp_r1"))

            manager.syncPendingQueue()

            assertEquals(listOf("gate", "createRecipe"), calls)
            assertEquals(listOf(setOf("a", "b")), gated)
        }

    @Test
    fun anOperationWithoutFoodReferencesNeverTouchesTheGate() =
        runTest {
            queueEntry(null)

            manager.syncPendingQueue()

            assertEquals(listOf("createEntry"), calls)
        }

    @Test
    fun aBusyServerKeepsTheEntryQueuedForALaterDrain() =
        runTest {
            gateFailure = ApiException("rate limited", 429)
            queueEntry("bulk-food")

            val synced = manager.syncPendingQueue()

            assertEquals(0, synced)
            assertEquals(1, syncQueue.pendingCount())
            coVerify(exactly = 0) { api.createEntry(any(), any(), any()) }
        }

    @Test
    fun aFoodThatCanNeverBeUploadedParksTheEntryWithTheReason() =
        runTest {
            gateFailure = ApiException("rejected", 404)
            queueEntry("bulk-food")

            manager.syncPendingQueue()

            assertEquals(0, syncQueue.pendingCount())
            assertEquals(1L, syncQueue.failedCount())
        }
}
