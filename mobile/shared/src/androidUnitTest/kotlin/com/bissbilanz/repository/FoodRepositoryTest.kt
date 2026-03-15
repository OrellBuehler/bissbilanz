package com.bissbilanz.repository

import app.cash.sqldelight.Query
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.cache.BissbilanzDatabaseQueries
import com.bissbilanz.cache.CachedFood
import com.bissbilanz.model.FoodCreate
import com.bissbilanz.model.ServingUnit
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.test.TestFixtures
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class FoodRepositoryTest {
    private lateinit var api: BissbilanzApi
    private lateinit var db: BissbilanzDatabase
    private lateinit var queries: BissbilanzDatabaseQueries
    private lateinit var syncQueue: SyncQueue
    private lateinit var repository: FoodRepository
    private val json = Json { ignoreUnknownKeys = true }

    @BeforeTest
    fun setup() {
        api = mockk()
        queries = mockk(relaxUnitFun = true, relaxed = true)
        db =
            mockk {
                every { bissbilanzDatabaseQueries } returns queries
            }
        syncQueue = mockk(relaxed = true)
        every { queries.selectFoodByBarcode(any()) } returns mockBarcodeQuery(null)
        repository = FoodRepository(api, db, syncQueue, json)
    }

    private fun mockBarcodeQuery(food: CachedFood?): Query<CachedFood> {
        val query = mockk<Query<CachedFood>>()
        every { query.executeAsOneOrNull() } returns food
        return query
    }

    private fun foodToCachedFood(food: com.bissbilanz.model.Food): CachedFood =
        CachedFood(
            id = food.id,
            name = food.name,
            brand = food.brand,
            calories = food.calories,
            protein = food.protein,
            carbs = food.carbs,
            fat = food.fat,
            fiber = food.fiber,
            isFavorite = if (food.isFavorite) 1L else 0L,
            barcode = food.barcode,
            jsonData = json.encodeToString(food),
        )

    @Test
    fun refreshFoodsCachesDataOnSuccess() =
        runTest {
            val foods =
                listOf(
                    TestFixtures.food(id = "1", name = "Apple"),
                    TestFixtures.food(id = "2", name = "Banana"),
                )
            coEvery { api.getFoods(100, 0) } returns foods

            repository.refreshFoods()

            coVerify { queries.transaction(any(), any()) }
        }

    @Test
    fun refreshFavoritesCallsApi() =
        runTest {
            val favorites = listOf(TestFixtures.food(id = "1", name = "Chicken", isFavorite = true))
            coEvery { api.getFavorites() } returns favorites

            repository.refreshFavorites()

            coVerify { api.getFavorites() }
        }

    @Test
    fun searchFoodsReturnsResults() =
        runTest {
            val results =
                listOf(
                    TestFixtures.food(id = "1", name = "Apple"),
                    TestFixtures.food(id = "2", name = "Apple Pie"),
                )
            coEvery { api.searchFoods("apple") } returns results

            val found = repository.searchFoods("apple")

            assertEquals(2, found.size)
        }

    @Test
    fun createFoodSavesLocallyAndEnqueuesSync() =
        runTest {
            val create =
                FoodCreate(
                    name = "Rice",
                    servingSize = 100.0,
                    servingUnit = ServingUnit.G,
                    calories = 130.0,
                    protein = 2.7,
                    carbs = 28.0,
                    fat = 0.3,
                    fiber = 0.4,
                )

            val result = repository.createFood(create)

            assertEquals("Rice", result.name)
            assertTrue(result.id.startsWith("temp_"))
            coVerify { syncQueue.enqueue(match<SyncOperation> { it is SyncOperation.CreateFood }) }
        }

    @Test
    fun findByBarcodeReturnsFood() =
        runTest {
            val food = TestFixtures.food(id = "1", name = "Milk")
            coEvery { api.getFoodByBarcode("123456") } returns food

            val result = repository.findByBarcode("123456")

            assertEquals("Milk", result?.name)
            verify { queries.insertFood(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
        }

    @Test
    fun findByBarcodeReturnsNullWhenNotFound() =
        runTest {
            coEvery { api.getFoodByBarcode("000000") } returns null

            val result = repository.findByBarcode("000000")

            assertNull(result)
        }

    @Test
    fun findByBarcodeReturnsCachedWhenApiReturnsNull() =
        runTest {
            val food = TestFixtures.food(id = "1", name = "Cached Milk")
            coEvery { api.getFoodByBarcode("123456") } returns null
            every { queries.selectFoodByBarcode("123456") } returns mockBarcodeQuery(foodToCachedFood(food))

            val result = repository.findByBarcode("123456")

            assertEquals("Cached Milk", result?.name)
        }

    @Test
    fun findByBarcodeReturnsCachedWhenApiFailsOffline() =
        runTest {
            val food = TestFixtures.food(id = "1", name = "Offline Milk")
            coEvery { api.getFoodByBarcode("123456") } throws RuntimeException("Network error")
            every { queries.selectFoodByBarcode("123456") } returns mockBarcodeQuery(foodToCachedFood(food))

            val result = repository.findByBarcode("123456")

            assertEquals("Offline Milk", result?.name)
        }

    @Test
    fun findByBarcodeCachesApiResult() =
        runTest {
            val food = TestFixtures.food(id = "1", name = "Fresh Milk")
            coEvery { api.getFoodByBarcode("123456") } returns food

            repository.findByBarcode("123456")

            verify {
                queries.insertFood(
                    id = "1",
                    name = "Fresh Milk",
                    brand = null,
                    calories = 200.0,
                    protein = 20.0,
                    carbs = 25.0,
                    fat = 8.0,
                    fiber = 3.0,
                    isFavorite = 0L,
                    barcode = null,
                    jsonData = any(),
                )
            }
        }

    @Test
    fun deleteFoodDeletesLocallyAndEnqueuesSync() =
        runTest {
            repository.deleteFood("1")

            coVerify { syncQueue.enqueue(match<SyncOperation> { it is SyncOperation.DeleteFood && it.id == "1" }) }
        }

    @Test
    fun recentFoodsStateFlowStartsEmpty() {
        assertTrue(repository.recentFoods.value.isEmpty())
    }
}
