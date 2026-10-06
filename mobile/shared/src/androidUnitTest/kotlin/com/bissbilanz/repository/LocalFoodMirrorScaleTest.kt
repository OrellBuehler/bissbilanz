package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.OpenFoodFactsClient
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.mode.AppMode
import com.bissbilanz.sync.ConnectivityProvider
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.test.NoopErrorReporter
import com.bissbilanz.test.TestFixtures
import com.bissbilanz.test.appModeManager
import com.bissbilanz.test.inMemoryCacheDatabase
import com.bissbilanz.test.inMemoryUserDataDatabase
import com.bissbilanz.userdata.UserDataDatabase
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.seconds
import kotlin.time.measureTime

class LocalFoodMirrorScaleTest {
    private lateinit var db: UserDataDatabase
    private lateinit var cacheDb: BissbilanzDatabase
    private lateinit var repository: FoodRepository
    private val json = Json { ignoreUnknownKeys = true }
    private val localMode = appModeManager(AppMode.LOCAL)

    @BeforeTest
    fun setup() {
        db = inMemoryUserDataDatabase()
        cacheDb = inMemoryCacheDatabase()
        repository =
            FoodRepository(
                mockk<BissbilanzApi>(),
                db,
                cacheDb,
                SyncQueue(cacheDb, json, localMode),
                json,
                NoopErrorReporter(),
                localMode,
                mockk<OpenFoodFactsClient>(relaxed = true),
                mockk<ConnectivityProvider>(relaxed = true),
                Dispatchers.Unconfined,
            )
        val queries = db.userDataDatabaseQueries
        queries.transaction {
            for (i in 0 until FOOD_COUNT) {
                val food =
                    TestFixtures.food(
                        id = "food-%05d".format(i),
                        name = "Food %05d".format(i),
                    )
                queries.insertFood(
                    id = food.id,
                    name = food.name,
                    brand = if (i % 100 == 0) "Brand" else null,
                    calories = food.calories,
                    protein = food.protein,
                    carbs = food.carbs,
                    fat = food.fat,
                    fiber = food.fiber,
                    isFavorite = 0L,
                    barcode = null,
                    jsonData = json.encodeToString(food),
                )
            }
        }
    }

    @Test
    fun pagingALargeMirrorReturnsOnlyTheRequestedPage() =
        runTest {
            lateinit var page: com.bissbilanz.api.generated.model.FoodsListResponse
            val elapsed = measureTime { page = repository.fetchFoodsPaginated(limit = 20, offset = 20_000) }

            assertEquals(FOOD_COUNT, page.total)
            assertEquals(20, page.foods.size)
            assertEquals("Food 20000", page.foods.first().name)
            assertTrue(elapsed < 5.seconds, "paging took $elapsed")
        }

    @Test
    fun searchOnALargeMirrorIsLimitedAndRanked() =
        runTest {
            lateinit var found: List<com.bissbilanz.api.generated.model.Food>
            val elapsed = measureTime { found = repository.searchFoods("Food 0123") }

            assertEquals(10, found.size)
            assertEquals("Food 01230", found.first().name)
            assertTrue(elapsed < 5.seconds, "search took $elapsed")
        }

    @Test
    fun broadSearchStopsAtTheResultLimit() =
        runTest {
            val found = repository.searchFoods("Food")

            assertEquals(50, found.size)
        }

    @Test
    fun resolveByNameFindsAFoodWithoutDecodingTheMirror() {
        val food = repository.resolveByName("food 24999")

        assertNotNull(food)
        assertEquals("food-24999", food.id)
    }

    private companion object {
        const val FOOD_COUNT = 25_000
    }
}
