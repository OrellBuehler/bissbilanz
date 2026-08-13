package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.OpenFoodFactsClient
import com.bissbilanz.api.generated.model.EntryCreate
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.mode.AppMode
import com.bissbilanz.model.Entry
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.test.NoopErrorReporter
import com.bissbilanz.test.TestFixtures
import com.bissbilanz.test.appModeManager
import com.bissbilanz.test.inMemoryCacheDatabase
import com.bissbilanz.test.inMemoryUserDataDatabase
import com.bissbilanz.userdata.UserDataDatabase
import com.bissbilanz.util.decodeOrNull
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Verifies that Local mode never touches the API: the SQLite cache is the primary
 * store, refreshes no-op, reads are served from cache, and nothing is enqueued.
 * The [BissbilanzApi] mock is strict (not relaxed), so any API call fails the test.
 */
class LocalModeGatingTest {
    private lateinit var api: BissbilanzApi
    private lateinit var db: UserDataDatabase
    private lateinit var cacheDb: BissbilanzDatabase
    private lateinit var syncQueue: SyncQueue
    private lateinit var entryRepository: EntryRepository
    private lateinit var foodRepository: FoodRepository
    private val json = Json { ignoreUnknownKeys = true }
    private val localMode = appModeManager(AppMode.LOCAL)

    @BeforeTest
    fun setup() {
        api = mockk()
        db = inMemoryUserDataDatabase()
        cacheDb = inMemoryCacheDatabase()
        syncQueue = SyncQueue(cacheDb, json, localMode)
        entryRepository = EntryRepository(api, db, cacheDb, syncQueue, json, NoopErrorReporter(), localMode)
        foodRepository =
            FoodRepository(
                api,
                db,
                cacheDb,
                syncQueue,
                json,
                NoopErrorReporter(),
                localMode,
                mockk<OpenFoodFactsClient>(relaxed = true),
                Dispatchers.Unconfined,
            )
    }

    @Test
    fun entryRefreshDoesNotCallApi() =
        runTest {
            // Strict api mock: any call would throw a MockKException.
            entryRepository.refresh("2024-01-15")
        }

    @Test
    fun foodRefreshesDoNotCallApi() =
        runTest {
            foodRepository.refreshFoods()
            foodRepository.refreshFavorites()
            foodRepository.refreshRecentFoods()
        }

    @Test
    fun getFoodReturnsCachedWithoutApi() =
        runTest {
            seedFood(TestFixtures.food(id = "f1", name = "Cached Oats"))

            val food = foodRepository.getFood("f1")

            assertEquals("Cached Oats", food.name)
        }

    @Test
    fun searchFoodsQueriesCacheOnly() =
        runTest {
            seedFood(TestFixtures.food(id = "f1", name = "Apple"))
            seedFood(TestFixtures.food(id = "f2", name = "Apple Pie"))

            val results = foodRepository.searchFoods("Apple")

            assertEquals(2, results.size)
        }

    @Test
    fun searchFoodsMatchesBrandAndRanksNameFirst() =
        runTest {
            // Name has no "coop"; only the brand does.
            seedFood(TestFixtures.food(id = "f1", name = "Granola").copy(brand = "Coop"))
            // Name itself contains "coop".
            seedFood(TestFixtures.food(id = "f2", name = "Coop Bread"))

            val results = foodRepository.searchFoods("coop")

            assertEquals(2, results.size)
            // Name match leads the brand-only match.
            assertEquals("Coop Bread", results[0].name)
            assertEquals("Granola", results[1].name)
        }

    @Test
    fun findByBarcodeIsCacheOnly() =
        runTest {
            seedFood(TestFixtures.food(id = "f1", name = "Milk").copy(barcode = "123456"))

            assertEquals("Milk", foodRepository.findByBarcode("123456")?.name)
            assertNull(foodRepository.findByBarcode("000000"))
        }

    @Test
    fun fetchFoodsPaginatedServesFromCache() =
        runTest {
            seedFood(TestFixtures.food(id = "f1", name = "Apple"))
            seedFood(TestFixtures.food(id = "f2", name = "Banana"))
            seedFood(TestFixtures.food(id = "f3", name = "Carrot"))

            val page = foodRepository.fetchFoodsPaginated(limit = 2, offset = 1)

            assertEquals(3, page.total)
            assertEquals(listOf("Banana", "Carrot"), page.foods.map { it.name })
        }

    @Test
    fun createEntryWritesCacheAndLeavesQueueEmpty() =
        runTest {
            val create =
                EntryCreate(
                    foodId = "f1",
                    mealType = "lunch",
                    servings = 1.0,
                    date = "2024-01-15",
                )

            val result = entryRepository.createEntry(create)

            assertTrue(result.id.startsWith("temp_"))
            val cached = db.userDataDatabaseQueries.selectEntriesByDate("2024-01-15").executeAsList()
            assertEquals(1, cached.size)
            assertEquals(0, syncQueue.pendingCount())
        }

    @Test
    fun recentFoodsAreDerivedFromCachedEntries() =
        runTest {
            seedFood(TestFixtures.food(id = "f1", name = "Older Food"))
            seedFood(TestFixtures.food(id = "f2", name = "Newer Food"))
            seedEntry(TestFixtures.entry(id = "e1", date = "2024-01-10").copy(foodId = "f1"))
            seedEntry(TestFixtures.entry(id = "e2", date = "2024-01-15").copy(foodId = "f2"))

            foodRepository.refreshRecentFoods()

            assertEquals(listOf("Newer Food", "Older Food"), foodRepository.recentFoods.value.map { it.name })
        }

    @Test
    fun calendarStatsAreComputedFromCache() =
        runTest {
            val statsRepository = StatsRepository(api, db, json, NoopErrorReporter(), localMode)
            seedEntry(TestFixtures.entry(id = "e1", date = "2024-01-10"))
            seedEntry(TestFixtures.entry(id = "e2", date = "2024-01-10"))
            seedEntry(TestFixtures.entry(id = "e3", date = "2024-01-15"))
            // Entry outside the requested month must be excluded.
            seedEntry(TestFixtures.entry(id = "e4", date = "2024-02-01"))

            val days = statsRepository.getCalendarStats("2024-01")

            assertEquals(listOf("2024-01-10", "2024-01-15"), days.map { it.date })
            assertTrue(days.all { it.hasEntries })
            // TestFixtures.entry carries a food with 200 kcal and 1 serving.
            assertEquals(400.0, days[0].calories)
            assertEquals(200.0, days[1].calories)
        }

    private fun seedFood(food: Food) {
        db.userDataDatabaseQueries.insertFood(
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

    private fun seedEntry(entry: Entry) {
        db.userDataDatabaseQueries.insertEntry(
            id = entry.id,
            date = entry.date,
            mealType = entry.mealType,
            servings = entry.servings,
            foodId = entry.foodId,
            recipeId = entry.recipeId,
            foodName = entry.food?.name,
            calories = entry.food?.calories ?: 0.0,
            protein = entry.food?.protein ?: 0.0,
            carbs = entry.food?.carbs ?: 0.0,
            fat = entry.food?.fat ?: 0.0,
            fiber = entry.food?.fiber ?: 0.0,
            jsonData = json.encodeToString(entry),
        )
        // Sanity: the entry decodes back (guards against fixture drift).
        checkNotNull(json.decodeOrNull<Entry>(json.encodeToString(entry)))
    }
}
