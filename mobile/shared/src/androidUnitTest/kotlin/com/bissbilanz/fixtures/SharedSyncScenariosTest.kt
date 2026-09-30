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
import com.bissbilanz.test.TestFixtures
import com.bissbilanz.test.appModeManager
import com.bissbilanz.test.inMemoryUserDataDatabase
import com.bissbilanz.util.newTempId
import io.ktor.client.statement.HttpResponse
import io.ktor.http.headersOf
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlin.test.Test
import kotlin.test.fail

/**
 * Drives every case in tests/fixtures/shared/sync-scenarios.json through the real
 * [SyncManager]: a queue of changes, a scripted server (the [BissbilanzApi] mock answers
 * from the case's `server` table) and the fixture says which requests went out and what
 * became of each row. The web queue and the iOS SyncManager run the same cases; known
 * differences are `divergences` in the fixture.
 */
class SharedSyncScenariosTest {
    private val json = Json { ignoreUnknownKeys = true }

    private class Sent(
        val signature: String,
        val key: String?,
        val body: String?,
    )

    @Test
    fun syncScenarios() =
        runTest {
            val fixture = loadFixture("sync-scenarios.json")
            val failures = mutableListOf<String>()
            for (case in fixture.cases) {
                try {
                    val actual = run(case)
                    failures += diff(actual, case.expected, fixture.tolerance, case.label).map { "sync-scenarios $it" }
                } catch (e: Exception) {
                    failures += "sync-scenarios ${case.label}: threw $e"
                }
            }
            if (failures.isNotEmpty()) {
                fail("Kotlin sync diverged from sync-scenarios.json:\n" + failures.joinToString("\n"))
            }
        }

    private suspend fun run(case: FixtureCase): JsonElement {
        val server = case.input.getValue("server").jsonObject
        val cursor = mutableMapOf<String, Int>()
        val sent = mutableListOf<Sent>()

        val api = mockk<BissbilanzApi>()
        coEvery { api.createFood(any(), any(), any()) } answers {
            val food = respond("POST /api/foods", server, cursor, sent, secondArg(), firstArg<FoodCreate>().name)
            TestFixtures.food(id = food as String)
        }
        coEvery { api.createEntry(any(), any(), any()) } answers {
            val body = firstArg<EntryCreate>()
            val id = respond("POST /api/entries", server, cursor, sent, secondArg(), json.encodeToString(body))
            TestFixtures.entry(id = id as String)
        }
        coEvery { api.deleteEntry(any(), any(), any()) } answers {
            respond("DELETE /api/entries/${firstArg<String>()}", server, cursor, sent, secondArg(), null)
            Unit
        }

        val driver = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
        BissbilanzDatabase.Schema.create(driver)
        val syncQueue = SyncQueue(BissbilanzDatabase(driver), json, appModeManager())
        val connectivity = mockk<ConnectivityProvider>()
        every { connectivity.isOnline } returns MutableStateFlow(true)
        val manager =
            SyncManager(syncQueue, connectivity, api, inMemoryUserDataDatabase(), json, NoopErrorReporter(), appModeManager())

        val steps =
            case.input
                .getValue("queue")
                .jsonArray
                .map { it.jsonObject }
        val tempIds = mutableMapOf<String, String>()
        for (step in steps) {
            val ref = step.getValue("ref").jsonPrimitive.content
            when (val op = step.getValue("op").jsonPrimitive.content) {
                "createFood" -> {
                    val id = newTempId()
                    tempIds[ref] = id
                    syncQueue.enqueue(SyncOperation.CreateFood(json.encodeToString(foodCreate()), localId = id))
                }

                "createEntry" -> {
                    val referenced = step["food"]?.jsonPrimitive?.content
                    val foodId = if (referenced != null) tempIds.getValue(referenced) else step.getValue("foodId").jsonPrimitive.content
                    val body = EntryCreate(mealType = "lunch", servings = 1.0, date = "2026-06-01", foodId = foodId)
                    syncQueue.enqueue(SyncOperation.CreateEntry(json.encodeToString(body), localId = newTempId()))
                }

                "deleteEntry" -> syncQueue.enqueue(SyncOperation.DeleteEntry(step.getValue("id").jsonPrimitive.content))

                else -> error("unknown op $op")
            }
        }
        // Rows come back in enqueue order; ref i is the i-th row.
        val rowIds = syncQueue.all().map { it.id }
        check(rowIds.size == steps.size) { "queued ${rowIds.size} rows for ${steps.size} steps" }

        val drains =
            case.input
                .getValue("drains")
                .jsonPrimitive.intOrNull!!
        val reset =
            case.input
                .getValue("resetBackoffBetweenDrains")
                .jsonPrimitive.booleanOrNull!!
        for (n in 0 until drains) {
            if (n > 0 && reset) rowIds.forEach { syncQueue.setNextAttemptAt(it, 0) }
            manager.syncPendingQueue()
        }

        val remaining = syncQueue.all().associateBy { it.id }
        val rows = mutableMapOf<String, JsonElement>()
        val retryCounts = mutableMapOf<String, JsonElement>()
        steps.forEachIndexed { index, step ->
            val ref = step.getValue("ref").jsonPrimitive.content
            val row = remaining[rowIds[index]]
            rows[ref] =
                JsonPrimitive(
                    if (row == null) {
                        "removed"
                    } else if (row.failedAt != null) {
                        "parked"
                    } else {
                        "live"
                    },
                )
            retryCounts[ref] = JsonPrimitive(row?.retryCount ?: 0L)
        }

        val keysBySignature = sent.groupBy { it.signature }.mapValues { (_, list) -> list.map { it.key }.toSet() }
        return buildJsonObject {
            put("requests", buildJsonArray { sent.forEach { add(JsonPrimitive(it.signature)) } })
            put("rows", JsonObject(rows))
            put("retryCounts", JsonObject(retryCounts))
            put(
                "entryFoodIds",
                buildJsonArray {
                    sent.filter { it.signature == "POST /api/entries" }.forEach {
                        add(JsonPrimitive(json.decodeFromString<EntryCreate>(it.body!!).foodId))
                    }
                },
            )
            put("stableKeys", keysBySignature.values.all { it.size == 1 })
        }
    }

    /**
     * Answers one request from the scripted server: records it, then either returns the
     * created id (a `created:<id>` result), throws the failure the API client would, or
     * returns Unit for a bare success. The last scripted response repeats.
     */
    private fun respond(
        signature: String,
        server: JsonObject,
        cursor: MutableMap<String, Int>,
        sent: MutableList<Sent>,
        key: String?,
        body: String?,
    ): Any? {
        sent += Sent(signature, key, body)
        val script = server[signature]?.jsonArray ?: throw ApiException("unscripted", 404)
        val n = cursor.getOrDefault(signature, 0)
        cursor[signature] = n + 1
        val response = script[minOf(n, script.size - 1)].jsonObject
        val status = response.getValue("status").jsonPrimitive.intOrNull!!
        if (status !in 200..299) {
            val headers = (response["headers"] as? JsonObject)?.mapValues { it.value.jsonPrimitive.content }.orEmpty()
            throw serverFailure(status, headers)
        }
        val result = response["result"]?.jsonPrimitive?.content
        return when {
            result == "unreadable" -> throw SerializationException("unreadable body")
            result != null && result.startsWith("created:") -> result.removePrefix("created:")
            else -> Unit
        }
    }

    private fun serverFailure(
        status: Int,
        responseHeaders: Map<String, String>,
    ): ApiException =
        if (responseHeaders.isEmpty()) {
            ApiException("error", status)
        } else {
            ApiException(
                "error",
                status,
                rawResponse =
                    mockk<HttpResponse> {
                        every { headers } returns headersOf(*responseHeaders.map { it.key to listOf(it.value) }.toTypedArray())
                    },
            )
        }

    private fun foodCreate() =
        FoodCreate(
            name = "Skyr",
            servingSize = 150.0,
            servingUnit = ServingUnit.g,
            calories = 98.0,
            protein = 16.0,
            carbs = 6.0,
            fat = 0.2,
            fiber = 0.0,
        )
}
