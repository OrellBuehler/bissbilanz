package com.bissbilanz.foodpackage

import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.ApiException
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.BulkFoodImage
import com.bissbilanz.api.UnauthorizedException
import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.FoodBulkItem
import com.bissbilanz.api.generated.model.FoodBulkResponse
import com.bissbilanz.api.generated.model.FoodBulkResult
import com.bissbilanz.test.TestFixtures
import com.bissbilanz.test.inMemoryUserDataDatabase
import io.ktor.client.statement.HttpResponse
import io.ktor.http.headersOf
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

private class UploadFakeImages : PackageImageStore {
    val files = mutableMapOf<String, ByteArray>()
    val adopted = mutableListOf<Pair<String, String>>()
    val discarded = mutableListOf<String>()

    override suspend fun read(imageUrl: String) = files[imageUrl]

    override suspend fun size(imageUrl: String) = files[imageUrl]?.size?.toLong()

    override suspend fun thumbnail(bytes: ByteArray) = null

    override suspend fun saveImported(bytes: ByteArray): String? = null

    override suspend fun readForUpload(
        imageUrl: String,
        maxBytes: Int,
    ) = files[imageUrl]?.takeIf { it.size <= maxBytes }

    override suspend fun adoptUploaded(
        localUrl: String,
        serverUrl: String,
    ) {
        adopted.add(localUrl to serverUrl)
        files.remove(localUrl)
    }

    override suspend fun discard(imageUrl: String) {
        discarded.add(imageUrl)
    }
}

class BulkFoodUploaderTest {
    private val json = Json { ignoreUnknownKeys = true }
    private val db = inMemoryUserDataDatabase()
    private val api = mockk<BissbilanzApi>()
    private val images = UploadFakeImages()
    private val reported = mutableListOf<Throwable>()
    private val store = BulkUploadStore(db)
    private var nextId = 0
    private val uploader =
        BulkFoodUploader(
            api = api,
            db = db,
            json = json,
            images = images,
            store = store,
            errorReporter =
                object : ErrorReporter {
                    override fun captureException(e: Throwable) {
                        reported.add(e)
                    }
                },
            currentUserId = { "user-1" },
            newId = { "11111111-1111-4111-8111-%012d".format(++nextId) },
        )
    private val queries get() = db.userDataDatabaseQueries

    private fun queue(
        id: String,
        name: String = "Food $id",
        user: String = "user-1",
        imageUrl: String? = null,
        barcode: String? = null,
        labels: List<String>? = null,
    ) {
        val food = TestFixtures.food(id = id, name = name).copy(imageUrl = imageUrl, barcode = barcode, labels = labels)
        labels?.forEach { queries.insertFoodLabel(id, it) }
        queries.insertFood(id, name, null, 0.0, 0.0, 0.0, 0.0, 0.0, 0L, barcode, json.encodeToString(food))
        queries.insertBulkJob(id, user)
    }

    private fun food(id: String): Food = json.decodeFromString(queries.selectFoodById(id).executeAsOne().jsonData)

    private fun state(id: String) = queries.selectBulkJob(id).executeAsOneOrNull()?.state

    private fun answer(vararg statuses: Pair<String, String>) =
        FoodBulkResponse(statuses.map { (id, status) -> FoodBulkResult(id = id, status = status) })

    private fun answerAll(status: String = "created") {
        val items = slot<List<FoodBulkItem>>()
        coEvery { api.bulkCreateFoods(capture(items), any()) } answers {
            FoodBulkResponse(items.captured.map { FoodBulkResult(id = it.id, status = status) })
        }
    }

    @Test
    fun sendsTwoHundredFoodsPerRequestUntilTheQueueIsDrained() =
        runTest {
            (1..450).forEach { queue("f$it") }
            val sizes = mutableListOf<Int>()
            val items = slot<List<FoodBulkItem>>()
            coEvery { api.bulkCreateFoods(capture(items), any()) } answers {
                sizes.add(items.captured.size)
                FoodBulkResponse(items.captured.map { FoodBulkResult(id = it.id, status = "created") })
            }

            val steps = generateSequence { runBlockingStep() }.takeWhile { it != BulkUploadStep.Idle }.toList()

            assertEquals(listOf(200, 200, 50), sizes)
            assertEquals(3, steps.size)
            assertEquals(BulkUploadCounts(total = 450, done = 450, pending = 0, failed = 0), store.counts())
        }

    private fun runBlockingStep(): BulkUploadStep = kotlinx.coroutines.runBlocking { uploader.uploadNext("user-1") }

    @Test
    fun createdAndExistsSettleTheJobAndAHostedImageReplacesTheLocalOne() =
        runTest {
            queue("a", imageUrl = "file:///img/a.webp")
            queue("b")
            images.files["file:///img/a.webp"] = byteArrayOf(1, 2, 3, 4)
            coEvery { api.bulkCreateFoods(any(), any()) } returns
                FoodBulkResponse(
                    listOf(
                        FoodBulkResult(id = "a", status = "created", imageUrl = "/uploads/abc.webp"),
                        FoodBulkResult(id = "b", status = "exists"),
                    ),
                )

            val step = uploader.uploadNext("user-1")

            assertEquals(BulkUploadStep.Progress(handled = 2, failed = 0), step)
            assertEquals("done", state("a"))
            assertEquals("done", state("b"))
            assertEquals("/uploads/abc.webp", food("a").imageUrl)
            assertEquals(listOf("file:///img/a.webp" to "/uploads/abc.webp"), images.adopted)
        }

    @Test
    fun aDuplicateBarcodeDropsTheBarcodeLocallyAndTheNextRequestIsTheRetryWithoutIt() =
        runTest {
            queue("a", barcode = "4001")
            val sent = mutableListOf<String?>()
            val items = slot<List<FoodBulkItem>>()
            coEvery { api.bulkCreateFoods(capture(items), any()) } answers {
                sent.add(items.captured.single().barcode)
                FoodBulkResponse(items.captured.map { FoodBulkResult(it.id, if (it.barcode != null) "duplicate_barcode" else "created") })
            }

            uploader.uploadNext("user-1")
            assertEquals("pending", state("a"))
            assertNull(food("a").barcode)
            uploader.uploadNext("user-1")

            assertEquals(listOf("4001", null), sent)
            assertEquals("done", state("a"))
        }

    @Test
    fun anInvalidFoodIsParkedAsFailedWithTheServersMessage() =
        runTest {
            queue("a")
            queue("b")
            coEvery { api.bulkCreateFoods(any(), any()) } returns
                FoodBulkResponse(
                    listOf(
                        FoodBulkResult(id = "a", status = "invalid", message = "name: Too long"),
                        FoodBulkResult(id = "b", status = "created"),
                    ),
                )

            val step = uploader.uploadNext("user-1")

            assertEquals(BulkUploadStep.Progress(handled = 2, failed = 1), step)
            assertEquals("failed", state("a"))
            assertEquals("name: Too long", queries.selectBulkJob("a").executeAsOne().lastError)
            assertEquals(BulkUploadCounts(total = 2, done = 1, pending = 0, failed = 1), store.counts())
            assertEquals(BulkUploadStep.Idle, uploader.uploadNext("user-1"))
        }

    @Test
    fun anIdOwnedByAnotherAccountGivesTheFoodAndItsReferencesANewId() =
        runTest {
            queue("old-id", labels = listOf("bread"))
            queries.insertEntry(
                "e1",
                "2026-10-06",
                "Lunch",
                1.0,
                "old-id",
                null,
                "Food",
                1.0,
                1.0,
                1.0,
                1.0,
                1.0,
                """{"foodId":"old-id"}""",
            )
            val first = slot<List<FoodBulkItem>>()
            coEvery { api.bulkCreateFoods(capture(first), any()) } answers {
                FoodBulkResponse(first.captured.map { FoodBulkResult(it.id, if (it.id == "old-id") "id_conflict" else "created") })
            }

            uploader.uploadNext("user-1")
            val newId = "11111111-1111-4111-8111-000000000001"

            assertNull(queries.selectFoodById("old-id").executeAsOneOrNull())
            assertEquals("Food old-id", food(newId).name)
            assertEquals(newId, food(newId).id)
            assertEquals("pending", state(newId))
            assertNull(state("old-id"))
            assertEquals(newId, queries.selectEntryById("e1").executeAsOne().foodId)
            assertEquals("""{"foodId":"$newId"}""", queries.selectEntryById("e1").executeAsOne().jsonData)
            assertEquals(listOf(newId), queries.selectFoodIdsByLabels(listOf("bread")).executeAsList())

            uploader.uploadNext("user-1")
            assertEquals("done", state(newId))
        }

    @Test
    fun aRateLimitAsksToWaitForRetryAfterAndKeepsEverythingQueued() =
        runTest {
            queue("a")
            val response = mockk<HttpResponse>()
            every { response.headers } returns headersOf("Retry-After", "7")
            coEvery { api.bulkCreateFoods(any(), any()) } throws ApiException("limited", 429, response)

            val step = uploader.uploadNext("user-1")

            assertEquals(BulkUploadStep.RateLimited(7_000), step)
            assertEquals("pending", state("a"))
        }

    @Test
    fun aRateLimitWithoutRetryAfterWaitsAMinute() =
        runTest {
            queue("a")
            val response = mockk<HttpResponse>()
            every { response.headers } returns headersOf()
            coEvery { api.bulkCreateFoods(any(), any()) } throws ApiException("limited", 429, response)

            assertEquals(BulkUploadStep.RateLimited(60_000), uploader.uploadNext("user-1"))
        }

    @Test
    fun failedRequestsMapToTheStepTheWorkerActsOn() =
        runTest {
            queue("a")
            coEvery { api.bulkCreateFoods(any(), any()) } throws UnauthorizedException()
            assertEquals(BulkUploadStep.Unauthorized, uploader.uploadNext("user-1"))

            coEvery { api.bulkCreateFoods(any(), any()) } throws ApiException("expired", 401)
            assertEquals(BulkUploadStep.Unauthorized, uploader.uploadNext("user-1"))

            coEvery { api.bulkCreateFoods(any(), any()) } throws ApiException("old", 426)
            assertEquals(BulkUploadStep.UpdateRequired, uploader.uploadNext("user-1"))

            coEvery { api.bulkCreateFoods(any(), any()) } throws ApiException("down", 503)
            assertTrue(uploader.uploadNext("user-1") is BulkUploadStep.Transient)

            coEvery { api.bulkCreateFoods(any(), any()) } throws java.io.IOException("offline")
            assertTrue(uploader.uploadNext("user-1") is BulkUploadStep.Transient)

            assertEquals("pending", state("a"))
        }

    @Test
    fun aRequestTheServerRefusesAsAWholeParksItsFoodsInsteadOfLoopingForever() =
        runTest {
            queue("a")
            queue("b")
            coEvery { api.bulkCreateFoods(any(), any()) } throws ApiException("bad", 400)

            val step = uploader.uploadNext("user-1")

            assertEquals(BulkUploadStep.Progress(handled = 2, failed = 2), step)
            assertEquals(2L, store.counts().failed)
            assertEquals(1, reported.size)
        }

    @Test
    fun aMismatchedAnswerIsReportedAndRetriedLater() =
        runTest {
            queue("a")
            queue("b")
            coEvery { api.bulkCreateFoods(any(), any()) } returns answer("a" to "created")

            val step = uploader.uploadNext("user-1")

            assertTrue(step is BulkUploadStep.Transient)
            assertEquals(1, reported.size)
            assertEquals("pending", state("a"))
        }

    @Test
    fun onlyTheSignedInUsersFoodsAreSent() =
        runTest {
            queue("theirs", user = "someone-else")

            assertEquals(BulkUploadStep.Idle, uploader.uploadNext("user-1"))

            coVerify(exactly = 0) { api.bulkCreateFoods(any(), any()) }
        }

    @Test
    fun aFoodDeletedSinceItWasQueuedLeavesNothingToSend() =
        runTest {
            queue("gone")
            queries.deleteFood("gone")
            queue("kept")
            answerAll()

            val step = uploader.uploadNext("user-1")

            assertEquals(BulkUploadStep.Progress(handled = 2, failed = 0), step)
            assertNull(state("gone"))
            assertEquals("done", state("kept"))
        }

    @Test
    fun sendsLocalPhotosAsPartsAndKeepsLocalPathsOutOfTheJson() =
        runTest {
            queue("a", imageUrl = "file:///img/a.webp")
            queue("big", imageUrl = "file:///img/big.webp")
            queue("remote").also {
                val remote = food("remote").copy(imageUrl = "https://images.openfoodfacts.org/x.jpg")
                queries.insertFood("remote", remote.name, null, 0.0, 0.0, 0.0, 0.0, 0.0, 0L, null, json.encodeToString(remote))
            }
            images.files["file:///img/a.webp"] = BulkPackageFixtures.webp
            images.files["file:///img/big.webp"] = ByteArray(BULK_UPLOAD_IMAGE_BYTES + 1)
            val items = slot<List<FoodBulkItem>>()
            val parts = slot<Map<String, BulkFoodImage>>()
            coEvery { api.bulkCreateFoods(capture(items), capture(parts)) } answers {
                FoodBulkResponse(items.captured.map { FoodBulkResult(it.id, "created") })
            }

            uploader.uploadNext("user-1")

            assertEquals(setOf("a"), parts.captured.keys)
            assertEquals("image/webp", parts.captured.getValue("a").contentType)
            assertTrue(items.captured.filter { it.id in setOf("a", "big") }.all { it.imageUrl == null })
            assertEquals("https://images.openfoodfacts.org/x.jpg", items.captured.first { it.id == "remote" }.imageUrl)
        }

    @Test
    fun keepsOneRequestUnderTheImageByteBudget() =
        runTest {
            (1..4).forEach {
                queue("p$it", imageUrl = "file:///img/$it.webp")
                images.files["file:///img/$it.webp"] = ByteArray(BULK_UPLOAD_IMAGE_BYTES)
            }
            val sizes = mutableListOf<Int>()
            val items = slot<List<FoodBulkItem>>()
            coEvery { api.bulkCreateFoods(capture(items), any()) } answers {
                sizes.add(items.captured.size)
                FoodBulkResponse(items.captured.map { FoodBulkResult(it.id, "created") })
            }

            uploader.uploadNext("user-1")
            uploader.uploadNext("user-1")

            assertTrue(sizes.all { it * BULK_UPLOAD_IMAGE_BYTES <= BulkFoodUploader.MAX_BATCH_IMAGE_BYTES })
            assertEquals(4, sizes.sum())
        }

    @Test
    fun ensureUploadedSendsJustTheFoodsAnEntryWaitsFor() =
        runTest {
            queue("wanted")
            queue("other")
            val items = slot<List<FoodBulkItem>>()
            coEvery { api.bulkCreateFoods(capture(items), any()) } answers {
                FoodBulkResponse(items.captured.map { FoodBulkResult(it.id, "created") })
            }

            uploader.ensureUploaded(setOf("wanted", "not-bulk"))

            assertEquals(listOf("wanted"), items.captured.map { it.id })
            assertEquals("done", state("wanted"))
            assertEquals("pending", state("other"))
        }

    @Test
    fun ensureUploadedDoesNothingForFoodsAlreadyOnTheServer() =
        runTest {
            queue("done-one")
            queries.markBulkJobDone("done-one")

            uploader.ensureUploaded(setOf("done-one", "plain"))

            coVerify(exactly = 0) { api.bulkCreateFoods(any(), any()) }
        }

    @Test
    fun ensureUploadedFailsTheWaitingOperationWhenTheFoodCannotBeUploaded() =
        runTest {
            queue("bad")
            coEvery { api.bulkCreateFoods(any(), any()) } returns
                FoodBulkResponse(listOf(FoodBulkResult(id = "bad", status = "invalid", message = "nope")))

            val failure = assertFailsWith<ApiException> { uploader.ensureUploaded(setOf("bad")) }

            assertEquals(404, failure.statusCode)
        }

    @Test
    fun ensureUploadedSurfacesALaterRetryAsATransientStatus() =
        runTest {
            queue("a")
            val response = mockk<HttpResponse>()
            every { response.headers } returns headersOf()
            coEvery { api.bulkCreateFoods(any(), any()) } throws ApiException("limited", 429, response)

            assertEquals(429, assertFailsWith<ApiException> { uploader.ensureUploaded(setOf("a")) }.statusCode)

            coEvery { api.bulkCreateFoods(any(), any()) } throws java.io.IOException("offline")
            assertEquals(503, assertFailsWith<ApiException> { uploader.ensureUploaded(setOf("a")) }.statusCode)
        }
}
