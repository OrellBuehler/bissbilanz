package com.bissbilanz.api

import com.bissbilanz.auth.AuthManager
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.respondError
import io.ktor.client.request.HttpRequestData
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.TextContent
import io.ktor.http.headersOf
import io.mockk.mockk
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

class BissbilanzApiClaudeTest {
    private val authManager: AuthManager = mockk(relaxed = true)
    private val requests = mutableListOf<HttpRequestData>()

    private val preferencesJson =
        """
        {"preferences":{
          "showChartWidget":true,"showFavoritesWidget":true,"showRecipeSuggestionsWidget":true,
          "showSupplementsWidget":true,"showWeightWidget":true,"showMealBreakdownWidget":true,
          "showTopFoodsWidget":true,"showSleepWidget":true,"showFastingWidget":true,
          "showDayPropertiesWidget":true,"showWaterWidget":true,"showActivityWidget":true,
          "showNotesWidget":true,"widgetOrder":[],"mealOrder":[],"startPage":"dashboard",
          "favoriteTapAction":"instant","favoriteMealAssignmentMode":"time_based",
          "favoriteMealTimeframes":[],"visibleNutrients":[],"waterGoalMl":2000,"locale":null,
          "timeZone":"UTC","activityGoalAdjustment":false,"activityCreditPercent":100,
          "aiTaskProcessor":"assistant","aiTaskProcessorKind":"claude","aiTaskAutoLog":false},
         "claude":{"available":true,"remainingBudgetUsd":8.31}}
        """.trimIndent()

    private fun taskJson(
        state: String,
        kind: String?,
    ) = """
        {"id":"t1","userId":"u1","status":"pending","description":"2 eggs","photoUrl":null,"photoUrls":[],
         "date":"2026-10-12","mealType":"Breakfast","eatenAt":null,"source":"android","resultSummary":null,
         "createdEntryIds":null,"completedAt":null,"dismissedAt":null,"acknowledgedAt":null,
         "processedBy":null,"processedByKind":${kind?.let { "\"$it\"" } ?: "null"},
         "claudeProcessing":{"state":"$state","proposal":{"summary":"Eggs","items":[
           {"id":"i1","name":"Egg","quantityDescription":"2 eggs","foodId":null,"recipeId":null,
            "servings":2,"calories":156,"protein":12.6,"carbs":1.2,"fat":10.6,"fiber":0,
            "newFood":{"name":"Egg","brand":null,"servingSize":50,"servingUnit":"g"}}]}}}
        """.trimIndent()

    private fun api(
        status: HttpStatusCode,
        body: String,
    ) = BissbilanzApi(
        baseUrl = "https://api.example.com",
        authManager = authManager,
        clientPlatform = "android",
        clientVersion = "1.53.0",
        updateGate = UpdateGate(),
        engine =
            MockEngine { request ->
                requests += request
                if (status.value < 400) {
                    respond(body, status, headersOf(HttpHeaders.ContentType, "application/json"))
                } else {
                    respondError(status, body)
                }
            },
    )

    @Test
    fun preferencesResponseCarriesTheCapabilityAndTheKind() =
        runBlocking {
            val response = api(HttpStatusCode.OK, preferencesJson).getPreferencesResponse()

            assertEquals("claude", response.preferences.aiTaskProcessorKind)
            assertEquals(true, response.claude?.available)
            assertEquals(8.31, response.claude?.remainingBudgetUsd)
        }

    @Test
    fun preferencesWithoutTheCapabilityStillDecode() =
        runBlocking {
            val withoutClaude = preferencesJson.substringBefore("\"claude\":{").trimEnd().trimEnd(',') + "}"
            val response = api(HttpStatusCode.OK, withoutClaude).getPreferencesResponse()

            assertNull(response.claude)
        }

    @Test
    fun anUnknownStateAndKindDecodeInsteadOfCrashing() =
        runBlocking {
            val body = """{"tasks":[${taskJson("some_future_state", "some_future_kind")}],"total":1}"""

            val task = api(HttpStatusCode.OK, body).listAiTasks().tasks.single()

            assertEquals("some_future_state", task.claudeProcessing?.state)
            assertEquals("some_future_kind", task.processedByKind)
            assertEquals(
                "Egg",
                task.claudeProcessing
                    ?.proposal
                    ?.items
                    ?.single()
                    ?.name,
            )
            val newFood =
                task.claudeProcessing
                    ?.proposal
                    ?.items
                    ?.single()
                    ?.newFood
            assertEquals("Egg", newFood?.name)
            assertNull(newFood?.brand)
            assertEquals(50.0, newFood?.servingSize)
            assertEquals("g", newFood?.servingUnit)
        }

    @Test
    fun acceptPostsTheItemIdsToTheProposalRoute() =
        runBlocking {
            val body = """{"task":${taskJson("proposed", "claude")}}"""

            val task = api(HttpStatusCode.OK, body).acceptAiTaskProposal("t1", listOf("i1", "i2"), idempotencyKey = "key-1")

            val request = requests.single()
            assertEquals(HttpMethod.Post, request.method)
            assertEquals("/api/ai-tasks/t1/proposal/accept", request.url.encodedPath)
            assertEquals("key-1", request.headers["Idempotency-Key"])
            assertEquals("""{"itemIds":["i1","i2"]}""", (request.body as TextContent).text)
            assertEquals("t1", task.id)
        }

    @Test
    fun acceptWithItemIdsSendsOnlyThoseIds() =
        runBlocking {
            val body = """{"task":${taskJson("proposed", "claude")}}"""

            api(HttpStatusCode.OK, body).acceptAiTaskProposal("t1", itemIds = listOf("i1", "i2"))

            assertEquals("""{"itemIds":["i1","i2"]}""", (requests.single().body as TextContent).text)
        }

    @Test
    fun acceptSurfacesAConflictWithItsStatusCode() =
        runBlocking<Unit> {
            val error =
                assertFailsWith<ApiException> {
                    api(HttpStatusCode.Conflict, """{"error":"gone"}""").acceptAiTaskProposal("t1", listOf("i1"))
                }

            assertEquals(409, error.statusCode)
        }
}
