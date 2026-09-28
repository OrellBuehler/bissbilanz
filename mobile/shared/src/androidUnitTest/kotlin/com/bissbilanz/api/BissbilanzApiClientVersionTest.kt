package com.bissbilanz.api

import com.bissbilanz.auth.AuthManager
import io.ktor.client.engine.mock.*
import io.ktor.client.request.HttpRequestData
import io.ktor.http.*
import io.mockk.mockk
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * The client version header pair is attached by [BissbilanzApi] itself (see
 * [applyClientVersionHeaders]/[installUpdateGate]) — [com.bissbilanz.api.OpenFoodFactsClientTest]
 * covers the other half: that a completely separate client (OFF) never sees them.
 */
class BissbilanzApiClientVersionTest {
    private val authManager: AuthManager = mockk(relaxed = true)

    private fun apiRespondingWith(
        status: HttpStatusCode = HttpStatusCode.OK,
        headers: Headers = headersOf(),
        updateGate: UpdateGate = UpdateGate(),
        onRequest: (HttpRequestData) -> Unit = {},
    ): BissbilanzApi {
        val engine =
            MockEngine { request ->
                onRequest(request)
                respond(content = "test-bytes", status = status, headers = headers)
            }
        return BissbilanzApi(
            baseUrl = "https://api.example.com",
            authManager = authManager,
            clientPlatform = "android",
            clientVersion = "1.53.0",
            updateGate = updateGate,
            engine = engine,
        )
    }

    @Test
    fun requestsCarryTheClientPlatformAndVersionHeaders() =
        runBlocking {
            var requestHeaders: Headers? = null
            val api = apiRespondingWith(onRequest = { requestHeaders = it.headers })

            api.downloadFile("/api/account")

            assertEquals("android", requestHeaders?.get("X-Client-Platform"))
            assertEquals("1.53.0", requestHeaders?.get("X-Client-Version"))
        }

    @Test
    fun a426ResponseFlagsTheUpdateGateWithTheServersMinVersion() =
        runBlocking {
            val updateGate = UpdateGate()
            val api =
                apiRespondingWith(
                    status = HttpStatusCode(426, "Upgrade Required"),
                    headers = headersOf(HEADER_CLIENT_MIN_VERSION, "1.53.0"),
                    updateGate = updateGate,
                )

            runCatching { api.downloadFile("/api/account") }

            assertEquals(UpdateRequired("1.53.0"), updateGate.state.value)
        }

    @Test
    fun aSuccessfulResponseClearsAPreviouslyFlaggedUpdateGate() =
        runBlocking {
            val updateGate = UpdateGate().apply { flag("1.53.0") }
            val api = apiRespondingWith(status = HttpStatusCode.OK, updateGate = updateGate)

            api.downloadFile("/api/account")

            assertEquals(null, updateGate.state.value)
        }

    @Test
    fun downloadBytesOmitsTheHeadersForAThirdPartyHost() =
        runBlocking {
            var requestHeaders: Headers? = null
            val api = apiRespondingWith(onRequest = { requestHeaders = it.headers })

            api.downloadBytes("https://images.openfoodfacts.org/some/image.jpg")

            assertEquals(null, requestHeaders?.get("X-Client-Platform"))
            assertEquals(null, requestHeaders?.get("X-Client-Version"))
        }
}
