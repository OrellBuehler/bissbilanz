package com.bissbilanz.foodpackage

import com.bissbilanz.test.TestFixtures
import com.bissbilanz.test.inMemoryUserDataDatabase
import kotlinx.coroutines.CancellationException
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

private class MemoryCheckpoints : BulkImportCheckpoints {
    val saved = mutableMapOf<String, BulkImportCheckpoint>()

    override fun load(path: String) = saved[path]

    override fun save(
        path: String,
        checkpoint: BulkImportCheckpoint,
    ) {
        saved[path] = checkpoint
    }

    override fun clear(path: String) {
        saved.remove(path)
    }
}

class BulkImportRunnerTest {
    private val json = Json { ignoreUnknownKeys = true }
    private val db = inMemoryUserDataDatabase()
    private var nextId = 0
    private val checkpoints = MemoryCheckpoints()
    private var uploadsQueued = 0
    private val files = mutableListOf<File>()
    private val queries get() = db.userDataDatabaseQueries

    private fun runner() =
        BulkImportRunner(
            importer =
                BulkPackageImporter(
                    db = db,
                    json = json,
                    reader = AndroidBulkPackageReader(),
                    images = BulkFakeImageStore(),
                    now = { "2026-10-06T10:00:00Z" },
                    newId = { "00000000-0000-4000-8000-%012d".format(++nextId) },
                ),
            checkpoints = checkpoints,
            onFoodsQueued = { uploadsQueued++ },
        )

    @AfterTest
    fun cleanUp() = files.forEach { it.delete() }

    private fun pack(foods: List<String>): String {
        val file = File.createTempFile("bulk-runner", ".bissbilanz").also { files.add(it) }
        BulkPackageFixtures.zip(file, BulkPackageFixtures.manifest(foods, emptyList()), emptyMap())
        return file.path
    }

    private fun seed(name: String) {
        val food = TestFixtures.food(id = "mine-$name", name = name)
        queries.insertFood(food.id, name, null, 0.0, 0.0, 0.0, 0.0, 0.0, 0L, null, json.encodeToString(food))
    }

    private fun stopAfter(chunks: Int): suspend (BulkImportProgress) -> Unit {
        var seen = 0
        return { if (++seen == chunks) throw CancellationException("stopped") }
    }

    private fun foods(count: Int = 1200) =
        (1..count).map { if (it == 10) """{"ref":"f$it","name":""}""" else BulkPackageFixtures.foodJson(it) }

    @Test
    fun aStoppedImportResumesWithCumulativeCountsAndQueuesTheUploadBeforeStopping() =
        runTest {
            seed("Food 1")
            seed("Food 2")
            seed("Food 3")
            val path = pack(foods())

            val stopped = runCatching { runner().run(path, "user-1", stopAfter(2)) }.exceptionOrNull()

            assertTrue(stopped is CancellationException)
            assertEquals(2, uploadsQueued)
            val checkpoint = assertNotNull(checkpoints.load(path))
            assertEquals(1001, checkpoint.processed)
            assertEquals(997, checkpoint.created)
            assertEquals(3, checkpoint.skippedExisting)
            assertEquals(1, checkpoint.invalid)

            val summary = runner().run(path, "user-1")

            assertEquals(1200, summary.foodsInPackage)
            assertEquals(1196, summary.created)
            assertEquals(3, summary.skippedExisting)
            assertEquals(1, summary.invalid)
            assertEquals(1196, summary.queuedForUpload)
            assertEquals(1199L, queries.countFoods().executeAsOne())
            assertEquals(1196L, queries.countBulkJobs().executeAsOne().total)
            assertNull(checkpoints.load(path))
        }

    @Test
    fun theResumedRunReportsProgressFromWhereTheJobWas() =
        runTest {
            val path = pack(foods())
            runCatching { runner().run(path, null, stopAfter(1)) }
            val progress = mutableListOf<BulkImportProgress>()

            runner().run(path, null) { progress.add(it) }

            assertEquals(listOf(1001, 1200), progress.map { it.processed })
            assertEquals(1199, progress.last().created)
        }

    @Test
    fun localModeNeverQueuesUploads() =
        runTest {
            val summary = runner().run(pack(foods(20)), null)

            assertEquals(19, summary.created)
            assertEquals(0, summary.queuedForUpload)
            assertEquals(0, uploadsQueued)
        }

    @Test
    fun aFailedImportForgetsItsCheckpoint() =
        runTest {
            val file = File.createTempFile("bulk-broken", ".bissbilanz").also { files.add(it) }
            file.writeText("not a zip")
            checkpoints.save(file.path, BulkImportCheckpoint(10, 10, 0, 0, 0, 0))

            val failure = runCatching { runner().run(file.path, null) }.exceptionOrNull()

            assertNotNull(failure)
            assertNull(checkpoints.load(file.path))
        }
}
