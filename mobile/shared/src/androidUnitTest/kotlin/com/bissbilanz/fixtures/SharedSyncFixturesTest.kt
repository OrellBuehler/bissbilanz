package com.bissbilanz.fixtures

import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import com.bissbilanz.api.ApiException
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.api.generated.model.EntryCreate
import com.bissbilanz.api.generated.model.FoodCreate
import com.bissbilanz.api.generated.model.ServingUnit
import com.bissbilanz.cache.BissbilanzDatabase
import com.bissbilanz.sync.ConnectivityProvider
import com.bissbilanz.sync.SyncManager
import com.bissbilanz.sync.SyncOperation
import com.bissbilanz.sync.SyncQueue
import com.bissbilanz.test.NoopErrorReporter
import com.bissbilanz.test.appModeManager
import com.bissbilanz.test.inMemoryUserDataDatabase
import io.ktor.client.statement.HttpResponse
import io.ktor.http.headersOf
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.fail

/**
 * Drives every case in tests/fixtures/shared/conflict-resolution.json through the
 * real [SyncManager] drain loop: one queued write, one server response, and the
 * fixture says whether the write is removed, parked, retried or left untouched.
 * The web queue and the iOS SyncManager run the same cases.
 */
class SharedSyncFixturesTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun conflictResolution() =
        runTest {
            val fixture = loadFixture("conflict-resolution.json")
            val failures = mutableListOf<String>()
            for (case in fixture.cases) {
                try {
                    failures += outcome(case)
                } catch (e: Exception) {
                    failures += "${case.label}: threw $e"
                }
            }
            if (failures.isNotEmpty()) {
                fail("Kotlin sync diverged from conflict-resolution.json:\n" + failures.joinToString("\n"))
            }
        }

    private suspend fun outcome(case: FixtureCase): List<String> {
        val op =
            case.input
                .getValue("op")
                .jsonPrimitive.content
        val status =
            case.input
                .getValue("status")
                .jsonPrimitive.intOrNull!!
        val header = case.input.getValue("conflictHeader").let { if (it is JsonNull) null else it.jsonPrimitive.content }

        val api = mockk<BissbilanzApi>()
        val driver = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
        BissbilanzDatabase.Schema.create(driver)
        val syncQueue = SyncQueue(BissbilanzDatabase(driver), json, appModeManager())
        val connectivity = mockk<ConnectivityProvider>()
        every { connectivity.isOnline } returns MutableStateFlow(true)
        val manager =
            SyncManager(syncQueue, connectivity, api, inMemoryUserDataDatabase(), json, NoopErrorReporter(), appModeManager())

        val failure = serverResponse(status, header)
        when (op) {
            "update" -> {
                syncQueue.enqueue(SyncOperation.UpdateFood("f1", json.encodeToString(foodCreate())))
                coEvery { api.updateFood(any(), any(), any(), any()) } throws failure!!
            }

            "delete" -> {
                syncQueue.enqueue(SyncOperation.DeleteEntry("e1"))
                if (failure == null) {
                    coEvery { api.deleteEntry(any(), any(), any()) } returns Unit
                } else {
                    coEvery { api.deleteEntry(any(), any(), any()) } throws failure
                }
            }

            "create" -> {
                val body = EntryCreate(mealType = "lunch", servings = 1.0, date = "2024-01-15", foodId = "real-food-id")
                syncQueue.enqueue(SyncOperation.CreateEntry(json.encodeToString(body), localId = "temp_e1"))
                coEvery { api.createEntry(any(), any(), any()) } throws failure!!
            }

            else -> error("unknown op $op")
        }

        manager.syncPendingQueue()

        val rows = syncQueue.all()
        val parked = rows.filter { it.failedAt != null }
        val live = rows.filter { it.failedAt == null }
        val queue =
            when {
                rows.isEmpty() -> "removed"
                parked.size == 1 && live.isEmpty() -> "parked"
                live.size == 1 && parked.isEmpty() -> if (live.single().retryCount == 0L) "kept" else "retry"
                else -> "unexpected(live=${live.size}, parked=${parked.size})"
            }
        val notice =
            manager.state.value.conflictNotices
                .isNotEmpty()

        val expected = case.expected.jsonObject
        val problems = mutableListOf<String>()
        val expectedQueue = expected.getValue("queue").jsonPrimitive.content
        if (queue != expectedQueue) problems += "${case.label}: expected queue $expectedQueue, got $queue"
        if (expectedQueue == "retry" && live.singleOrNull()?.retryCount != 1L) {
            problems += "${case.label}: expected retryCount 1, got ${live.map { it.retryCount }}"
        }
        val expectedNotice = expected.getValue("conflictNotice")
        if (expectedNotice !is JsonNull && expectedNotice.jsonPrimitive.booleanOrNull != notice) {
            problems += "${case.label}: expected conflictNotice $expectedNotice, got ${JsonPrimitive(notice)}"
        }
        return problems
    }

    /** The exception the API client throws for [status]; null for a 2xx. */
    private fun serverResponse(
        status: Int,
        conflictHeader: String?,
    ): ApiException? =
        when {
            status in 200..299 -> null
            conflictHeader != null ->
                ApiException(
                    "conflict",
                    status,
                    rawResponse =
                        mockk<HttpResponse> {
                            every { headers } returns headersOf("X-Sync-Conflict", conflictHeader)
                        },
                )
            else -> ApiException("error", status)
        }

    private fun foodCreate() =
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
}
