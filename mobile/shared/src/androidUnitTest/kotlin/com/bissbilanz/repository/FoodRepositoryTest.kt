package com.bissbilanz.repository

import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.api.generated.model.FavoriteFood
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.FoodCreate
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.test.NoopErrorReporter
import com.bissbilanz.test.TestFixtures
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class FoodRepositoryTest {
    private lateinit var api: BissbilanzApi
    private lateinit var db: BissbilanzDatabase
    private lateinit var syncQueue: SyncQueue
    private lateinit var repository: FoodRepository
    private val json = Json { ignoreUnknownKeys = true }

    @BeforeTest
    fun setup() {
        api = mockk()
        val driver = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
        BissbilanzDatabase.Schema.create(driver)
        db = BissbilanzDatabase(driver)
        syncQueue = mockk(relaxed = true)
        repository = FoodRepository(api, db, syncQueue, json, NoopErrorReporter(), kotlinx.coroutines.Dispatchers.Unconfined)
    }

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

            val cached = db.bissbilanzDatabaseQueries.selectAllFoods().executeAsList()
            assertEquals(2, cached.size)
        }

    @Test
    fun refreshFavoritesCallsApi() =
        runTest {
            val favorites = listOf(
                FavoriteFood(
                    id = "1", name = "Chicken", imageUrl = null,
                    calories = 200.0, protein = 20.0, carbs = 25.0, fat = 8.0, fiber = 3.0,
                    logCount = 5, type = FavoriteFood.Type.food,
                ),
            )
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
                    servingUnit = FoodCreate.ServingUnit.g,
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
            val cached = db.bissbilanzDatabaseQueries.selectFoodByBarcode("123456").executeAsOneOrNull()
            assertNull(cached)
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
            seedFoodInCache(food.copy(barcode = "123456"))
            coEvery { api.getFoodByBarcode("123456") } returns null

            val result = repository.findByBarcode("123456")

            assertEquals("Cached Milk", result?.name)
        }

    @Test
    fun findByBarcodeReturnsCachedWhenApiFailsOffline() =
        runTest {
            val food = TestFixtures.food(id = "1", name = "Offline Milk")
            seedFoodInCache(food.copy(barcode = "123456"))
            coEvery { api.getFoodByBarcode("123456") } throws RuntimeException("Network error")

            val result = repository.findByBarcode("123456")

            assertEquals("Offline Milk", result?.name)
        }

    @Test
    fun findByBarcodeCachesApiResult() =
        runTest {
            val food = TestFixtures.food(id = "1", name = "Fresh Milk").copy(barcode = "123456")
            coEvery { api.getFoodByBarcode("123456") } returns food

            repository.findByBarcode("123456")

            val cached = db.bissbilanzDatabaseQueries.selectFoodByBarcode("123456").executeAsOneOrNull()
            assertNotNull(cached)
            assertEquals("1", cached.id)
        }

    @Test
    fun deleteFoodDeletesLocallyAndEnqueuesSync() =
        runTest {
            val food = TestFixtures.food(id = "1", name = "To Delete")
            seedFoodInCache(food)

            repository.deleteFood("1")

            val cached = db.bissbilanzDatabaseQueries.selectFoodById("1").executeAsOneOrNull()
            assertNull(cached)
            coVerify { syncQueue.enqueue(match<SyncOperation> { it is SyncOperation.DeleteFood && it.id == "1" }) }
        }

    @Test
    fun recentFoodsStateFlowStartsEmpty() {
        assertTrue(repository.recentFoods.value.isEmpty())
    }

    private fun seedFoodInCache(food: Food) {
        db.bissbilanzDatabaseQueries.insertFood(
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
    }
}
