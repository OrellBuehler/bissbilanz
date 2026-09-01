package com.bissbilanz.sync

import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.mode.AppMode
import com.bissbilanz.test.appModeManager
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Clock

class SyncQueueTest {
    private lateinit var db: BissbilanzDatabase
    private lateinit var queue: SyncQueue
    private val json = Json { ignoreUnknownKeys = true }

    @BeforeTest
    fun setup() {
        val driver = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
        BissbilanzDatabase.Schema.create(driver)
        db = BissbilanzDatabase(driver)
        queue = SyncQueue(db, json, appModeManager())
    }

    @Test
    fun enqueueAndDrainReturnsQueuedOperations() =
        runTest {
            queue.enqueue(SyncOperation.CreateFood("""{"name":"Rice"}""", localId = "temp_1"))
            queue.enqueue(SyncOperation.DeleteEntry("e1"))

            val drained = queue.drain()

            assertEquals(2, drained.size)
            val create = drained[0].operation as SyncOperation.CreateFood
            assertEquals("""{"name":"Rice"}""", create.body)
            assertEquals("temp_1", create.localId)
            val delete = drained[1].operation as SyncOperation.DeleteEntry
            assertEquals("e1", delete.id)
        }

    @Test
    fun nextRetryAtIsNullWhenNothingIsBackedOff() =
        runTest {
            queue.enqueue(SyncOperation.DeleteFood("f1"))

            assertNull(queue.nextRetryAt())
        }

    @Test
    fun nextRetryAtReturnsTheSoonestFutureGate() =
        runTest {
            queue.enqueue(SyncOperation.DeleteFood("f1"))
            queue.enqueue(SyncOperation.DeleteFood("f2"))
            queue.enqueue(SyncOperation.DeleteFood("f3"))
            val ids = queue.all().map { it.id }
            val now = Clock.System.now().toEpochMilliseconds()
            queue.setNextAttemptAt(ids[0], now + 60_000)
            queue.setNextAttemptAt(ids[1], now + 5_000)
            // Already due — must not win over the two future gates.
            queue.setNextAttemptAt(ids[2], now - 5_000)

            assertEquals(now + 5_000, queue.nextRetryAt())
        }

    @Test
    fun drainExcludesInProgressItems() =
        runTest {
            queue.enqueue(SyncOperation.DeleteFood("f1"))

            val first = queue.drain()
            val second = queue.drain()

            assertEquals(1, first.size)
            assertTrue(second.isEmpty())
        }

    @Test
    fun releaseForRetryMakesItemDrainableAgain() =
        runTest {
            queue.enqueue(SyncOperation.DeleteFood("f1"))
            val first = queue.drain().single()

            queue.releaseForRetry(first.id)

            assertEquals(1, queue.drain().size)
        }

    @Test
    fun removeDeletesItem() =
        runTest {
            queue.enqueue(SyncOperation.DeleteFood("f1"))
            val drained = queue.drain().single()

            queue.remove(drained.id)

            assertEquals(0, queue.pendingCount())
            assertTrue(queue.drain().isEmpty())
        }

    @Test
    fun incrementAndGetRetryCountIncrements() =
        runTest {
            queue.enqueue(SyncOperation.DeleteFood("f1"))
            val id = queue.drain().single().id

            assertEquals(1, queue.incrementAndGetRetryCount(id))
            assertEquals(2, queue.incrementAndGetRetryCount(id))
            assertEquals(3, queue.incrementAndGetRetryCount(id))
        }

    @Test
    fun findByAffectedReturnsOnlyMatchingItems() =
        runTest {
            queue.enqueue(SyncOperation.CreateFood("""{"name":"Rice"}""", localId = "temp_1"))
            queue.enqueue(SyncOperation.CreateFood("""{"name":"Oats"}""", localId = "temp_2"))
            // Same id but different table must not match.
            queue.enqueue(SyncOperation.UpdateEntry("temp_1", "{}"))

            val matches = queue.findByAffected("foods", "temp_1")

            assertEquals(1, matches.size)
            val op = matches.single().operation as SyncOperation.CreateFood
            assertEquals("""{"name":"Rice"}""", op.body)
        }

    @Test
    fun findByAffectedReturnsEmptyListWhenNothingMatches() =
        runTest {
            queue.enqueue(SyncOperation.CreateFood("{}", localId = "temp_1"))

            assertTrue(queue.findByAffected("foods", "temp_2").isEmpty())
        }

    @Test
    fun replaceOperationRewritesStoredOperation() =
        runTest {
            queue.enqueue(SyncOperation.CreateFood("""{"name":"Rice"}""", localId = "temp_1"))
            val queued = queue.findByAffected("foods", "temp_1").single()

            queue.replaceOperation(
                queued.id,
                SyncOperation.CreateFood("""{"name":"Brown Rice"}""", localId = "temp_1"),
            )

            val drained = queue.drain().single().operation as SyncOperation.CreateFood
            assertEquals("""{"name":"Brown Rice"}""", drained.body)
            assertEquals("temp_1", drained.localId)
        }

    @Test
    fun removeByAffectedDeletesMatchingItems() =
        runTest {
            queue.enqueue(SyncOperation.CreateFood("{}", localId = "temp_1"))
            queue.enqueue(SyncOperation.CreateFood("{}", localId = "temp_2"))

            queue.removeByAffected("foods", "temp_1")

            assertEquals(1, queue.pendingCount())
            val remaining = queue.drain().single().operation as SyncOperation.CreateFood
            assertEquals("temp_2", remaining.localId)
        }

    @Test
    fun enqueueIsNoOpInLocalMode() =
        runTest {
            // In Local mode the DB is the primary store; the login migrator uploads
            // cache state, so queued ops would double-apply.
            val localQueue = SyncQueue(db, json, appModeManager(AppMode.LOCAL))

            localQueue.enqueue(SyncOperation.CreateFood("{}", localId = "temp_1"))

            assertEquals(0, localQueue.pendingCount())
            assertTrue(localQueue.drain().isEmpty())
        }

    @Test
    fun enqueueWorksWhenModeIsSynced() =
        runTest {
            val syncedQueue = SyncQueue(db, json, appModeManager(AppMode.SYNCED))

            syncedQueue.enqueue(SyncOperation.DeleteEntry("e1"))

            assertEquals(1, syncedQueue.pendingCount())
        }

    @Test
    fun createOperationWithoutLocalIdDecodesFromLegacyJson() =
        runTest {
            // Old queued rows were serialized before localId existed.
            val legacy = """{"type":"create_food","body":"{}"}"""
            db.bissbilanzDatabaseQueries.insertSyncQueueItem(
                operation = legacy,
                createdAt = 0,
                affectedTable = "foods",
                affectedId = null,
                idempotencyKey = null,
                clientEditedAt = null,
            )

            val drained = queue.drain().single().operation as SyncOperation.CreateFood

            assertEquals(null, drained.localId)
        }
}
