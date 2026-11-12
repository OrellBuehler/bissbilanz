package com.bissbilanz.api

import com.bissbilanz.auth.AuthManager
import com.bissbilanz.repository.isActive
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.HttpRequestData
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.mockk.mockk
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class BissbilanzApiFoodEnrichmentTest {
    private val authManager: AuthManager = mockk(relaxed = true)
    private val requests = mutableListOf<HttpRequestData>()

    private fun apiRespondingWith(
        status: HttpStatusCode,
        body: String,
    ) = BissbilanzApi(
        baseUrl = "https://api.example.com",
        authManager = authManager,
        clientPlatform = "android",
        clientVersion = "1.58.0",
        updateGate = UpdateGate(),
        engine =
            MockEngine { request ->
                requests += request
                respond(body, status, headersOf("Content-Type", "application/json"))
            },
    )

    private fun statusJson(state: String) =
        """{"candidates":4,"job":{"state":"$state","total":4,"processed":1,"updated":1,"notFound":0,"failed":0,
        |"startedAt":"2026-11-12T10:00:00.000Z","finishedAt":null}}
        """.trimMargin()

    private val foodJson =
        """{"id":"f1","userId":"u1","name":"Skyr","brand":null,"servingSize":150.0,"servingUnit":"g",
        |"calories":98.0,"protein":16.0,"carbs":6.0,"fat":0.2,"fiber":0.0,"barcode":"4001234567890",
        |"isFavorite":false,"nutriScore":"a","novaGroup":1,"additives":null,"ingredientsText":null,
        |"imageUrl":null,"offCheckedAt":"2026-11-12T10:00:00.000Z"}
        """.trimMargin()

    @Test
    fun theRunEndpointsUseTheirMethodsAndDecodeTheStatus() =
        runBlocking {
            val api = apiRespondingWith(HttpStatusCode.OK, statusJson("running"))

            assertTrue(api.getFoodEnrichmentStatus().job?.isActive == true)
            assertEquals(4, api.startFoodEnrichment().candidates)
            assertEquals(1, api.cancelFoodEnrichment().job?.processed)

            assertEquals(listOf(HttpMethod.Get, HttpMethod.Post, HttpMethod.Delete), requests.map { it.method })
            assertTrue(requests.all { it.url.encodedPath == "/api/foods/enrichment" })
            assertTrue(requests.none { it.headers.contains("Idempotency-Key") })
        }

    @Test
    fun aJobStateThisBuildDoesNotKnowCountsAsFinished() =
        runBlocking {
            val api = apiRespondingWith(HttpStatusCode.OK, statusJson("paused"))

            assertFalse(api.getFoodEnrichmentStatus().job!!.isActive)
        }

    @Test
    fun aStatusWithoutAJobDecodes() =
        runBlocking {
            val api = apiRespondingWith(HttpStatusCode.OK, """{"candidates":0,"job":null}""")

            assertEquals(null, api.getFoodEnrichmentStatus().job)
        }

    @Test
    fun aRejectedCancelThrowsWithItsStatus() =
        runBlocking<Unit> {
            val api = apiRespondingWith(HttpStatusCode.TooManyRequests, """{"error":"Too many requests"}""")

            assertEquals(429, assertFailsWith<ApiException> { api.cancelFoodEnrichment() }.statusCode)
        }

    @Test
    fun enrichPostsForTheFoodAndKeepsTheServersOutcome() =
        runBlocking {
            val api = apiRespondingWith(HttpStatusCode.OK, """{"food":$foodJson,"outcome":"not_found"}""")

            val response = api.enrichFood("f1")

            assertEquals("not_found", response.outcome)
            assertEquals("2026-11-12T10:00:00.000Z", response.food.offCheckedAt)
            assertEquals(HttpMethod.Post, requests.single().method)
            assertEquals("/api/foods/f1/enrich", requests.single().url.encodedPath)
        }

    @Test
    fun aRejectedEnrichCarriesTheErrorBody() =
        runBlocking {
            val api = apiRespondingWith(HttpStatusCode.Conflict, """{"error":"Food changed during the lookup","code":"food_changed"}""")

            val thrown = assertFailsWith<ApiException> { api.enrichFood("f1") }

            assertEquals(409, thrown.statusCode)
            assertTrue(thrown.responseBody!!.contains("food_changed"))
        }
}
