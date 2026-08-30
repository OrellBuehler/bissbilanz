package com.bissbilanz.android.images

import io.mockk.every
import io.mockk.mockk
import okhttp3.Interceptor
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ApiHostAuthInterceptorTest {
    private val baseUrl = "https://bissbilanz.example.ch"

    private fun authHeaderFor(
        url: String,
        token: String? = "test-token",
        base: String = baseUrl,
    ): String? {
        var seen: Request? = null
        val original = Request.Builder().url(url).build()
        val chain =
            mockk<Interceptor.Chain> {
                every { request() } returns original
                every { proceed(any()) } answers {
                    val request = firstArg<Request>()
                    seen = request
                    Response
                        .Builder()
                        .request(request)
                        .protocol(Protocol.HTTP_1_1)
                        .code(200)
                        .message("OK")
                        .body("".toResponseBody(null))
                        .build()
                }
            }
        ApiHostAuthInterceptor(base) { token }.intercept(chain)
        return seen?.header("Authorization")
    }

    @Test
    fun `attaches the token to our own uploads`() {
        assertEquals(
            "Bearer test-token",
            authHeaderFor("$baseUrl/uploads/a1b2c3d4-0000-4000-8000-000000000001.webp"),
        )
    }

    @Test
    fun `never sends the token to Open Food Facts`() {
        assertNull(authHeaderFor("https://images.openfoodfacts.org/images/products/1/front.jpg"))
    }

    @Test
    fun `does not match a lookalike host`() {
        assertNull(authHeaderFor("https://bissbilanz.example.ch.evil.test/uploads/x.webp"))
        assertNull(authHeaderFor("https://evil.test/?next=https://bissbilanz.example.ch/uploads/x.webp"))
    }

    @Test
    fun `does not downgrade to plaintext or another port`() {
        assertNull(authHeaderFor("http://bissbilanz.example.ch/uploads/x.webp"))
        assertNull(authHeaderFor("https://bissbilanz.example.ch:8443/uploads/x.webp"))
    }

    @Test
    fun `sends nothing when signed out`() {
        assertNull(authHeaderFor("$baseUrl/uploads/x.webp", token = null))
    }
}
