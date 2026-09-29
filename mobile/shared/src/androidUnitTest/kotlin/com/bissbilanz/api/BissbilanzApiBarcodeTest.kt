package com.bissbilanz.api

import com.bissbilanz.auth.AuthManager
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.mockk.mockk
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

class BissbilanzApiBarcodeTest {
    private val authManager: AuthManager = mockk(relaxed = true)

    private fun apiRespondingWith(
        status: HttpStatusCode,
        body: String,
    ) = BissbilanzApi(
        baseUrl = "https://api.example.com",
        authManager = authManager,
        clientPlatform = "android",
        clientVersion = "1.53.0",
        updateGate = UpdateGate(),
        engine =
            MockEngine {
                respond(body, status, headersOf("Content-Type", "application/json"))
            },
    )

    private val foodJson =
        """{"id":"f1","userId":"u1","name":"Skyr","brand":null,"servingSize":150.0,"servingUnit":"g",
        |"calories":98.0,"protein":16.0,"carbs":6.0,"fat":0.2,"fiber":0.0,"barcode":"4001234567890",
        |"isFavorite":false,"nutriScore":null,"novaGroup":null,"additives":null,"ingredientsText":null,
        |"imageUrl":null}
        """.trimMargin()

    @Test
    fun barcodeLookupReadsTheListEnvelopeTheServerReturns() =
        runBlocking {
            val api = apiRespondingWith(HttpStatusCode.OK, """{"foods":[$foodJson],"total":1}""")

            assertEquals("f1", api.getFoodByBarcode("4001234567890")?.id)
        }

    @Test
    fun barcodeLookupIsNullWhenNothingMatches() =
        runBlocking {
            val api = apiRespondingWith(HttpStatusCode.OK, """{"foods":[],"total":0}""")

            assertNull(api.getFoodByBarcode("4001234567890"))
        }

    @Test
    fun barcodeLookupTreatsARejectedBarcodeAsNoMatchButLetsServerErrorsThrough() =
        runBlocking<Unit> {
            val rejected = apiRespondingWith(HttpStatusCode.BadRequest, """{"error":"Invalid barcode format"}""")
            assertNull(rejected.getFoodByBarcode("ABC-1"))

            val down = apiRespondingWith(HttpStatusCode.InternalServerError, """{"error":"boom"}""")
            assertFailsWith<ApiException> { down.getFoodByBarcode("4001234567890") }
        }
}
