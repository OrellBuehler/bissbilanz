package com.bissbilanz.foodpackage

import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.test.TestFixtures
import com.bissbilanz.test.inMemoryUserDataDatabase
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

private class BulkFakeImageStore : PackageImageStore {
    val files = mutableMapOf<String, ByteArray>()
    val discarded = mutableListOf<String>()
    private var counter = 0

    override suspend fun read(imageUrl: String) = files[imageUrl]

    override suspend fun size(imageUrl: String) = files[imageUrl]?.size?.toLong()

    override suspend fun thumbnail(bytes: ByteArray) = null

    override suspend fun saveImported(bytes: ByteArray): String? = error("the bulk path must use saveImportedBulk")

    override suspend fun saveImportedBulk(bytes: ByteArray): String? {
        if (bytes.size < 4) return null
        val url = "file:///images/bulk-${++counter}.webp"
        files[url] = bytes
        return url
    }

    override suspend fun discard(imageUrl: String) {
        discarded.add(imageUrl)
        files.remove(imageUrl)
    }
}

class BulkPackageImporterTest {
    private val json = Json { ignoreUnknownKeys = true }
    private val db = inMemoryUserDataDatabase()
    private val images = BulkFakeImageStore()
    private var nextId = 0
    private val importer =
        BulkPackageImporter(
            db = db,
            json = json,
            reader = AndroidBulkPackageReader(),
            images = images,
            now = { "2026-10-06T10:00:00Z" },
            newId = { "00000000-0000-4000-8000-%012d".format(++nextId) },
        )
    private val files = mutableListOf<File>()
    private val queries get() = db.userDataDatabaseQueries

    @AfterTest
    fun cleanUp() = files.forEach { it.delete() }

    private fun pack(
        foods: List<String>,
        recipes: List<String> = emptyList(),
        images: Map<String, ByteArray> = emptyMap(),
    ): String {
        val file = File.createTempFile("bulk-import", ".bissbilanz").also { files.add(it) }
        BulkPackageFixtures.zip(file, BulkPackageFixtures.manifest(foods, recipes), images)
        return file.path
    }

    private fun stored(id: String): Food = json.decodeFromString(queries.selectFoodById(id).executeAsOne().jsonData)

    private fun seed(
        id: String,
        name: String,
        brand: String? = null,
        barcode: String? = null,
    ) {
        val food = TestFixtures.food(id = id, name = name).copy(brand = brand, barcode = barcode)
        queries.insertFood(id, name, brand, 0.0, 0.0, 0.0, 0.0, 0.0, 0L, barcode, json.encodeToString(food))
    }

    @Test
    fun importsEveryFoodInChunksAndReportsProgress() =
        runTest {
            val path = pack((1..1200).map { BulkPackageFixtures.foodJson(it) })
            val progress = mutableListOf<BulkImportProgress>()

            val summary = importer.import(path, uploadUserId = null) { progress.add(it) }

            assertEquals(1200, summary.created)
            assertEquals(0, summary.skippedExisting)
            assertEquals(0, summary.queuedForUpload)
            assertEquals(1200L, queries.countFoods().executeAsOne())
            assertEquals(listOf(500, 1000, 1200), progress.map { it.processed })
            assertTrue(progress.all { it.total == 1200 })
            assertEquals(1200, progress.last().created)
        }

    @Test
    fun givesEveryFoodAFreshLowercaseUuidAndTheNutrientsOfThePackage() =
        runTest {
            val path = pack(listOf(BulkPackageFixtures.foodJson(7, name = "Müsli", brand = "Bio")))

            importer.import(path, uploadUserId = null)

            val food = stored("00000000-0000-4000-8000-000000000001")
            assertEquals("Müsli", food.name)
            assertEquals("Bio", food.brand)
            assertEquals(Food.ServingUnit.g, food.servingUnit)
            assertEquals(107.0, food.calories)
            assertEquals(4.0, food.fiber)
            assertEquals("2026-10-06T10:00:00Z", food.createdAt)
        }

    @Test
    fun skipsFoodsTheListAlreadyHoldsByNameAndBrandIgnoringCaseAndAccents() =
        runTest {
            seed("mine-1", "Crème Fraîche", brand = "Valio")
            seed("mine-2", "Apple")
            val path =
                pack(
                    listOf(
                        BulkPackageFixtures.foodJson(1, name = "creme fraiche", brand = "VALIO"),
                        BulkPackageFixtures.foodJson(2, name = "Apple", brand = "Granny"),
                        BulkPackageFixtures.foodJson(3, name = "Apple"),
                    ),
                )

            val summary = importer.import(path, uploadUserId = null)

            assertEquals(1, summary.created)
            assertEquals(2, summary.skippedExisting)
            assertEquals(
                setOf("mine-1", "mine-2", "00000000-0000-4000-8000-000000000001"),
                queries.selectAllFoodIds().executeAsList().toSet(),
            )
            assertEquals("Apple", stored("00000000-0000-4000-8000-000000000001").name)
            assertEquals("Granny", stored("00000000-0000-4000-8000-000000000001").brand)
        }

    @Test
    fun skipsAFoodRepeatedInsideThePackage() =
        runTest {
            val path = pack(listOf(BulkPackageFixtures.foodJson(1, name = "Twin"), BulkPackageFixtures.foodJson(2, name = " twin ")))

            val summary = importer.import(path, uploadUserId = null)

            assertEquals(1, summary.created)
            assertEquals(1, summary.skippedExisting)
        }

    @Test
    fun dropsABarcodeThatIsAlreadyTakenButKeepsTheFood() =
        runTest {
            seed("mine", "Old", barcode = "4001")
            val path =
                pack(
                    listOf(
                        BulkPackageFixtures.foodJson(1, name = "New A", barcode = "4001"),
                        BulkPackageFixtures.foodJson(2, name = "New B", barcode = "4002"),
                        BulkPackageFixtures.foodJson(3, name = "New C", barcode = "4002"),
                    ),
                )

            importer.import(path, uploadUserId = null)

            assertNull(stored("00000000-0000-4000-8000-000000000001").barcode)
            assertEquals("4002", stored("00000000-0000-4000-8000-000000000002").barcode)
            assertNull(stored("00000000-0000-4000-8000-000000000003").barcode)
        }

    @Test
    fun runningTheSameImportAgainOnlyAddsWhatIsMissing() =
        runTest {
            val first = pack((1..30).map { BulkPackageFixtures.foodJson(it) })
            importer.import(first, uploadUserId = "user-1")
            queries.deleteFood("00000000-0000-4000-8000-000000000005")

            val again = importer.import(first, uploadUserId = "user-1")

            assertEquals(1, again.created)
            assertEquals(29, again.skippedExisting)
            assertEquals(30L, queries.countFoods().executeAsOne())
        }

    @Test
    fun queuesAnUploadJobPerNewFoodForTheSignedInUserOnly() =
        runTest {
            val path = pack((1..5).map { BulkPackageFixtures.foodJson(it) })

            val summary = importer.import(path, uploadUserId = "user-1")

            assertEquals(5, summary.queuedForUpload)
            val counts = BulkUploadStore(db).counts()
            assertEquals(5L, counts.pending)
            assertEquals("user-1", queries.selectBulkJob("00000000-0000-4000-8000-000000000001").executeAsOne().userId)
        }

    @Test
    fun storesPhotosLocallyAndAppliesLabels() =
        runTest {
            val path =
                pack(
                    listOf(
                        BulkPackageFixtures.foodJson(1, image = "images/f1.webp", labels = listOf("Bread", "whole grain")),
                        BulkPackageFixtures.foodJson(2, image = "images/f2.webp"),
                        BulkPackageFixtures.foodJson(3),
                    ),
                    images = mapOf("images/f1.webp" to BulkPackageFixtures.webp),
                )

            val summary = importer.import(path, uploadUserId = null)

            assertEquals(1, summary.images)
            assertEquals(1, summary.imagesMissing)
            val first = stored("00000000-0000-4000-8000-000000000001")
            assertNotNull(first.imageUrl)
            assertTrue(first.imageUrl!!.startsWith("file:///images/bulk-"))
            assertEquals(listOf("bread", "whole grain"), first.labels)
            assertEquals(
                listOf(first.id),
                queries.selectFoodIdsByLabels(listOf("bread", "whole grain")).executeAsList(),
            )
            assertNull(stored("00000000-0000-4000-8000-000000000002").imageUrl)
        }

    @Test
    fun countsInvalidFoodsAndSkipsRecipes() =
        runTest {
            val recipe = """{"ref":"r1","name":"Soup","totalServings":2,"cookedWeight":null,"image":null,"ingredients":[]}"""
            val path =
                pack(listOf(BulkPackageFixtures.foodJson(1), """{"ref":"f2","name":""}""", BulkPackageFixtures.foodJson(3)), listOf(recipe))

            val summary = importer.import(path, uploadUserId = null)

            assertEquals(3, summary.foodsInPackage)
            assertEquals(2, summary.created)
            assertEquals(1, summary.invalid)
            assertEquals(1, summary.recipesSkipped)
        }

    @Test
    fun aFailingChunkLeavesNothingBehindAndDropsItsPhotos() =
        runTest {
            val path =
                pack(
                    listOf(
                        BulkPackageFixtures.foodJson(1, image = "images/f1.webp"),
                        BulkPackageFixtures.foodJson(2, image = "images/f2.webp"),
                    ),
                    images = mapOf("images/f1.webp" to BulkPackageFixtures.webp, "images/f2.webp" to BulkPackageFixtures.webp),
                )
            val failingStore =
                object : PackageImageStore by images {
                    var saved = 0

                    override suspend fun saveImportedBulk(bytes: ByteArray): String? {
                        if (++saved == 2) throw IllegalStateException("disk full")
                        return images.saveImportedBulk(bytes)
                    }
                }
            val failing = BulkPackageImporter(db, json, AndroidBulkPackageReader(), failingStore)

            val failure = runCatching { failing.import(path, uploadUserId = "u") }.exceptionOrNull()

            assertTrue(failure is IllegalStateException)
            assertEquals(0L, queries.countFoods().executeAsOne())
            assertEquals(0L, queries.countBulkJobs().executeAsOne().total)
            assertEquals(1, images.discarded.size)
        }

    @Test
    fun peekReportsTheCountsWithoutImporting() =
        runTest {
            val path = pack((1..12).map { BulkPackageFixtures.foodJson(it) })

            val info = importer.peek(path)

            assertEquals(12, info.foodCount)
            assertEquals(0L, queries.countFoods().executeAsOne())
        }
}
