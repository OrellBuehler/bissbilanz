package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.OpenFoodFactsClient
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.FoodCreate
import com.bissbilanz.api.generated.model.FoodsListResponse
import com.bissbilanz.api.generated.model.ServingUnit
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.sync.ConnectivityProvider
import com.bissbilanz.sync.QueuedRequest
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.test.NoopErrorReporter
import com.bissbilanz.test.TestFixtures
import com.bissbilanz.test.appModeManager
import com.bissbilanz.test.inMemoryCacheDatabase
import com.bissbilanz.test.inMemoryUserDataDatabase
import com.bissbilanz.userdata.UserDataDatabase
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class FoodRepositoryTest {
    private lateinit var api: BissbilanzApi
    private lateinit var db: UserDataDatabase
    private lateinit var cacheDb: BissbilanzDatabase
    private lateinit var syncQueue: SyncQueue
    private lateinit var repository: FoodRepository
    private val json = Json { ignoreUnknownKeys = true }

    @BeforeTest
    fun setup() {
        api = mockk()
        db = inMemoryUserDataDatabase()
        cacheDb = inMemoryCacheDatabase()
        syncQueue = mockk(relaxed = true)
        repository =
            FoodRepository(
                api,
                db,
                cacheDb,
                syncQueue,
                json,
                NoopErrorReporter(),
                appModeManager(),
                mockk<OpenFoodFactsClient>(relaxed = true),
                mockk<ConnectivityProvider>(relaxed = true),
                kotlinx.coroutines.Dispatchers.Unconfined,
            )
    }

    private fun deltaPage(
        foods: List<Food>,
        nextCursor: String? = null,
    ) = FoodsListResponse(foods = foods, total = foods.size, nextCursor = nextCursor)

    private fun cachedIds() =
        db.userDataDatabaseQueries
            .selectAllFoods()
            .executeAsList()
            .map { it.id }
            .toSet()

    private fun pendingUpdate(id: String) =
        QueuedRequest(
            id = 1L,
            operation = SyncOperation.UpdateFood(id, "{}"),
            createdAt = 0L,
            retryCount = 0L,
            idempotencyKey = "k",
            clientEditedAt = "t",
            nextAttemptAt = 0L,
        )

    @Test
    fun refreshFoodsCachesDataOnSuccess() =
        runTest {
            val foods =
                listOf(
                    TestFixtures.food(id = "1", name = "Apple"),
                    TestFixtures.food(id = "2", name = "Banana"),
                )
            coEvery { api.getFoodsDelta(any(), any(), any()) } returns deltaPage(foods)
            coEvery { api.getFoodIds() } returns listOf("1", "2")

            repository.refreshFoods()

            assertEquals(setOf("1", "2"), cachedIds())
        }

    @Test
    fun refreshFoodsFollowsTheCursorThroughEveryPage() =
        runTest {
            coEvery { api.getFoodsDelta(any(), any(), any()) } returnsMany
                listOf(
                    deltaPage(listOf(TestFixtures.food(id = "a", name = "A")), nextCursor = "c1"),
                    deltaPage(listOf(TestFixtures.food(id = "b", name = "B")), nextCursor = "c2"),
                    deltaPage(listOf(TestFixtures.food(id = "c", name = "C"))),
                )
            coEvery { api.getFoodIds() } returns listOf("a", "b", "c")

            repository.refreshFoods(pageSize = 1)

            assertEquals(setOf("a", "b", "c"), cachedIds())
            coVerify(exactly = 1) { api.getFoodsDelta("1970-01-01T00:00:00Z", null, 1) }
            coVerify(exactly = 1) { api.getFoodsDelta(null, "c1", 1) }
            coVerify(exactly = 1) { api.getFoodsDelta(null, "c2", 1) }
        }

    @Test
    fun refreshFoodsStoresTheNewestServerWriteAndResumesWithOverlap() =
        runTest {
            val older = TestFixtures.food(id = "1", name = "Old").copy(serverModifiedAt = "2026-10-05T10:00:00.000Z")
            val newer = TestFixtures.food(id = "2", name = "New").copy(serverModifiedAt = "2026-10-05T10:05:00.000Z")
            coEvery { api.getFoodsDelta(any(), any(), any()) } returns deltaPage(listOf(older, newer))
            coEvery { api.getFoodIds() } returns listOf("1", "2")

            repository.refreshFoods()

            val stored = cacheDb.bissbilanzDatabaseQueries.selectSyncMeta("foods_delta_checkpoint").executeAsOne()
            assertEquals("2026-10-05T10:05:00Z", stored)

            coEvery { api.getFoodsDelta(any(), any(), any()) } returns deltaPage(emptyList())
            coEvery { api.getFoodsPaginated(1, 0) } returns FoodsListResponse(foods = emptyList(), total = 2)

            repository.refreshFoods()

            coVerify(exactly = 1) { api.getFoodsDelta("2026-10-05T10:04:00Z", null, 1000) }
        }

    @Test
    fun refreshFoodsKeepsTheCheckpointWhenAnInterruptedSyncResumes() =
        runTest {
            val first = TestFixtures.food(id = "1", name = "One").copy(serverModifiedAt = "2026-10-05T10:00:00Z")
            coEvery { api.getFoodsDelta(any(), any(), any()) } returnsMany
                listOf(deltaPage(listOf(first), nextCursor = "c1")) andThenThrows RuntimeException("offline")

            assertFailsWith<RuntimeException> { repository.refreshFoods(pageSize = 1) }

            assertEquals(
                "2026-10-05T10:00:00Z",
                cacheDb.bissbilanzDatabaseQueries.selectSyncMeta("foods_delta_checkpoint").executeAsOne(),
            )
            assertEquals(setOf("1"), cachedIds())
        }

    @Test
    fun refreshFoodsPrunesACacheFoodTheServerNoLongerHas() =
        runTest {
            // Simulates the duplicate-merge case (src/lib/server/food-merge.ts deletes
            // the losing food rows): the change feed cannot report a hard delete, so the
            // id diff against /api/foods/ids has to remove it.
            seedFoodInCache(TestFixtures.food(id = "merged-away", name = "Stale Duplicate"))
            coEvery { api.getFoodsDelta(any(), any(), any()) } returns deltaPage(listOf(TestFixtures.food(id = "1", name = "Survivor")))
            coEvery { api.getFoodIds() } returns listOf("1")

            repository.refreshFoods()

            assertEquals(setOf("1"), cachedIds())
        }

    @Test
    fun refreshFoodsReportsTruncationWhenThePageCapIsHit() =
        runTest {
            val reported = mutableListOf<Throwable>()
            val reporter =
                object : com.bissbilanz.ErrorReporter {
                    override fun captureException(e: Throwable) {
                        reported.add(e)
                    }
                }
            val capped =
                FoodRepository(
                    api,
                    db,
                    cacheDb,
                    syncQueue,
                    json,
                    reporter,
                    appModeManager(),
                    mockk<OpenFoodFactsClient>(relaxed = true),
                    mockk<ConnectivityProvider>(relaxed = true),
                    kotlinx.coroutines.Dispatchers.Unconfined,
                )
            coEvery { api.getFoodsDelta(any(), any(), any()) } returns
                deltaPage(listOf(TestFixtures.food(id = "1", name = "One")), nextCursor = "more")

            capped.refreshFoods(pageSize = 1, maxPages = 3)

            assertEquals(1, reported.size)
        }

    @Test
    fun refreshFoodsKeepsTempAndPendingFoodsWhenPruning() =
        runTest {
            seedFoodInCache(TestFixtures.food(id = "temp_offline", name = "Not Yet Uploaded"))
            seedFoodInCache(TestFixtures.food(id = "pending-edit", name = "Edited Offline"))
            coEvery { api.getFoodsDelta(any(), any(), any()) } returns deltaPage(emptyList())
            coEvery { api.getFoodIds() } returns emptyList()
            coEvery { syncQueue.all() } returns listOf(pendingUpdate("pending-edit"))

            repository.refreshFoods()

            assertEquals(setOf("temp_offline", "pending-edit"), cachedIds())
        }

    @Test
    fun refreshFoodsNeverPrunesAfterATruncatedFetch() =
        runTest {
            seedFoodInCache(TestFixtures.food(id = "not-fetched-yet", name = "Still There"))
            coEvery { api.getFoodsDelta(any(), any(), any()) } returns
                deltaPage(listOf(TestFixtures.food(id = "1", name = "One")), nextCursor = "more")
            coEvery { api.getFoodIds() } returns listOf("1")

            repository.refreshFoods(pageSize = 1, maxPages = 1)

            assertEquals(setOf("not-fetched-yet", "1"), cachedIds())
            coVerify(exactly = 0) { api.getFoodIds() }
        }

    @Test
    fun refreshFoodsSkipsTheIdListWhileCountsMatchAndPruneIsRecent() =
        runTest {
            coEvery { api.getFoodsDelta(any(), any(), any()) } returns deltaPage(listOf(TestFixtures.food(id = "1", name = "One")))
            coEvery { api.getFoodIds() } returns listOf("1")
            coEvery { api.getFoodsPaginated(1, 0) } returns FoodsListResponse(foods = emptyList(), total = 1)

            repository.refreshFoods()
            repository.refreshFoods()

            coVerify(exactly = 1) { api.getFoodIds() }
        }

    @Test
    fun refreshFoodsReconcilesIdsEarlyWhenTheServerCountDiffers() =
        runTest {
            coEvery { api.getFoodsDelta(any(), any(), any()) } returns deltaPage(listOf(TestFixtures.food(id = "1", name = "One")))
            coEvery { api.getFoodIds() } returns listOf("1")

            repository.refreshFoods()
            seedFoodInCache(TestFixtures.food(id = "2", name = "Merged Away"))
            coEvery { api.getFoodsPaginated(1, 0) } returns FoodsListResponse(foods = emptyList(), total = 1)
            repository.refreshFoods()

            assertEquals(setOf("1"), cachedIds())
            coVerify(exactly = 2) { api.getFoodIds() }
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
    fun searchOpenFoodFactsUsesServerProxyWhenSynced() =
        runTest {
            val hits = listOf(TestFixtures.offProduct())
            coEvery { api.searchOpenFoodFacts("juice") } returns hits

            val found = repository.searchOpenFoodFacts("juice")

            assertEquals(hits, found)
        }

    @Test
    fun searchOpenFoodFactsSwallowsProxyFailure() =
        runTest {
            coEvery { api.searchOpenFoodFacts(any()) } throws RuntimeException("OFF down")

            val found = repository.searchOpenFoodFacts("juice")

            assertEquals(emptyList(), found)
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
                    servingUnit = ServingUnit.g,
                    calories = 130.0,
                    protein = 2.7,
                    carbs = 28.0,
                    fat = 0.3,
                    fiber = 0.4,
                )

            val result = repository.createFood(create)

            assertEquals("Rice", result.name)
            assertTrue(result.id.startsWith("temp_"))
            coVerify {
                syncQueue.enqueue(
                    match<SyncOperation> { it is SyncOperation.CreateFood && it.localId == result.id },
                )
            }
        }

    @Test
    fun deleteTempFoodRemovesQueuedCreateInsteadOfEnqueuingDelete() =
        runTest {
            repository.deleteFood("temp_abc")

            coVerify { syncQueue.removeByAffected("foods", "temp_abc") }
            coVerify(exactly = 0) { syncQueue.enqueue(any()) }
        }

    @Test
    fun findByBarcodeReturnsFood() =
        runTest {
            val food = TestFixtures.food(id = "1", name = "Milk")
            coEvery { api.getFoodByBarcode("123456") } returns food

            val result = repository.findByBarcode("123456")

            assertEquals("Milk", result?.name)
            val cached = db.userDataDatabaseQueries.selectFoodByBarcode("123456").executeAsOneOrNull()
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

            val cached = db.userDataDatabaseQueries.selectFoodByBarcode("123456").executeAsOneOrNull()
            assertNotNull(cached)
            assertEquals("1", cached.id)
        }

    @Test
    fun deleteFoodDeletesLocallyAndEnqueuesSync() =
        runTest {
            val food = TestFixtures.food(id = "1", name = "To Delete")
            seedFoodInCache(food)

            repository.deleteFood("1")

            val cached = db.userDataDatabaseQueries.selectFoodById("1").executeAsOneOrNull()
            assertNull(cached)
            coVerify { syncQueue.enqueue(match<SyncOperation> { it is SyncOperation.DeleteFood && it.id == "1" }) }
        }

    @Test
    fun recentFoodsStateFlowStartsEmpty() {
        assertTrue(repository.recentFoods.value.isEmpty())
    }

    @Test
    fun resolveByNamePrefersExactCaseInsensitiveMatch() {
        seedFoodInCache(TestFixtures.food(id = "1", name = "Banana Bread"))
        seedFoodInCache(TestFixtures.food(id = "2", name = "banana"))

        val result = repository.resolveByName("Banana")

        assertEquals("2", result?.id)
    }

    @Test
    fun resolveByNameFallsBackToPrefixMatch() {
        seedFoodInCache(TestFixtures.food(id = "1", name = "Greek Yogurt"))
        seedFoodInCache(TestFixtures.food(id = "2", name = "Yogurt Drink"))

        val result = repository.resolveByName("Yogurt")

        assertEquals("2", result?.id)
    }

    @Test
    fun resolveByNameFallsBackToContainsMatch() {
        seedFoodInCache(TestFixtures.food(id = "1", name = "Whole Wheat Bread"))

        val result = repository.resolveByName("Wheat")

        assertEquals("1", result?.id)
    }

    @Test
    fun resolveByNameReturnsNullWhenNothingMatches() {
        seedFoodInCache(TestFixtures.food(id = "1", name = "Apple"))

        val result = repository.resolveByName("Pizza")

        assertNull(result)
    }

    private fun queueBulkUpload(
        id: String,
        state: String = "pending",
    ) {
        db.userDataDatabaseQueries.insertBulkJob(id, "user-1")
        if (state == "failed") db.userDataDatabaseQueries.markBulkJobFailed("rejected", id)
    }

    @Test
    fun refreshFoodsKeepsBulkImportedFoodsThatAreStillWaitingForTheirUpload() =
        runTest {
            seedFoodInCache(TestFixtures.food(id = "bulk-pending", name = "Waiting"))
            seedFoodInCache(TestFixtures.food(id = "bulk-failed", name = "Rejected"))
            seedFoodInCache(TestFixtures.food(id = "gone", name = "Merged Away"))
            queueBulkUpload("bulk-pending")
            queueBulkUpload("bulk-failed", state = "failed")
            coEvery { api.getFoodsDelta(any(), any(), any()) } returns deltaPage(emptyList())
            coEvery { api.getFoodIds() } returns emptyList()
            coEvery { syncQueue.all() } returns emptyList()

            repository.refreshFoods()

            assertEquals(setOf("bulk-pending", "bulk-failed"), cachedIds())
        }

    @Test
    fun refreshFoodsDoesNotCountUploadingFoodsAgainstTheServerTotal() =
        runTest {
            coEvery { api.getFoodsDelta(any(), any(), any()) } returns deltaPage(listOf(TestFixtures.food(id = "1", name = "One")))
            coEvery { api.getFoodIds() } returns listOf("1")
            coEvery { api.getFoodsPaginated(1, 0) } returns FoodsListResponse(foods = emptyList(), total = 1)
            coEvery { syncQueue.all() } returns emptyList()
            repository.refreshFoods()
            seedFoodInCache(TestFixtures.food(id = "bulk-pending", name = "Waiting"))
            queueBulkUpload("bulk-pending")

            repository.refreshFoods()

            coVerify(exactly = 1) { api.getFoodIds() }
        }

    @Test
    fun editingAFoodThatIsWaitingForItsBulkUploadStaysOnTheDevice() =
        runTest {
            val original = TestFixtures.food(id = "bulk-pending", name = "Waiting").copy(labels = listOf("bread"))
            seedFoodInCache(original)
            queueBulkUpload("bulk-pending")
            val create =
                FoodCreate(
                    name = "Renamed",
                    servingSize = 100.0,
                    servingUnit = ServingUnit.g,
                    calories = 10.0,
                    protein = 1.0,
                    carbs = 1.0,
                    fat = 1.0,
                    fiber = 1.0,
                )

            repository.updateFood("bulk-pending", create)
            repository.toggleFavorite("bulk-pending", true)
            repository.setLabels("bulk-pending", listOf("cake"))

            io.mockk.coVerify(exactly = 0) { syncQueue.enqueue(any()) }
            val stored =
                json.decodeFromString<Food>(
                    db.userDataDatabaseQueries
                        .selectFoodById("bulk-pending")
                        .executeAsOne()
                        .jsonData,
                )
            assertEquals("Renamed", stored.name)
            assertTrue(stored.isFavorite)
            assertEquals(listOf("cake"), stored.labels)
        }

    @Test
    fun deletingAFoodThatIsWaitingForItsBulkUploadDropsItsJobWithoutAServerCall() =
        runTest {
            seedFoodInCache(TestFixtures.food(id = "bulk-pending", name = "Waiting"))
            queueBulkUpload("bulk-pending")

            repository.deleteFood("bulk-pending")

            assertEquals(emptySet(), cachedIds())
            assertNull(db.userDataDatabaseQueries.selectBulkJob("bulk-pending").executeAsOneOrNull())
            coVerify(exactly = 0) { syncQueue.enqueue(any()) }
        }

    @Test
    fun searchTopsUpTheServersAnswerWithBulkFoodsStillWaitingForTheirUpload() =
        runTest {
            seedFoodInCache(TestFixtures.food(id = "bulk-pending", name = "Haferflocken"))
            seedFoodInCache(TestFixtures.food(id = "uploaded", name = "Haferbrei"))
            seedFoodInCache(TestFixtures.food(id = "plain", name = "Haferschleim"))
            queueBulkUpload("bulk-pending")
            queueBulkUpload("uploaded")
            db.userDataDatabaseQueries.markBulkJobDone("uploaded")
            coEvery { api.searchFoods("Hafer") } returns listOf(TestFixtures.food(id = "uploaded", name = "Haferbrei"))

            val found = repository.searchFoods("Hafer")

            assertEquals(listOf("uploaded", "bulk-pending"), found.map { it.id })
        }

    @Test
    fun searchLeavesTheServersAnswerAloneWhenNothingIsWaiting() =
        runTest {
            seedFoodInCache(TestFixtures.food(id = "plain", name = "Haferschleim"))
            coEvery { api.searchFoods("Hafer") } returns emptyList()

            assertEquals(emptyList(), repository.searchFoods("Hafer"))
        }

    private fun seedFoodInCache(food: Food) {
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
}
