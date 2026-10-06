package com.bissbilanz.auth

import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

@OptIn(ExperimentalEncodingApi::class)
class JwtSubjectTest {
    private fun token(payload: String): String {
        val encoded = Base64.UrlSafe.withPadding(Base64.PaddingOption.ABSENT).encode(payload.encodeToByteArray())
        return "header.$encoded.signature"
    }

    @Test
    fun readsTheSubjectClaim() {
        assertEquals("user-42", jwtSubject(token("""{"sub":"user-42","exp":1}""")))
    }

    @Test
    fun readsPaddedAndUrlSafePayloads() {
        val padded = Base64.UrlSafe.encode("""{"sub":"üser>?~"}""".encodeToByteArray())
        assertEquals("üser>?~", jwtSubject("h.$padded.s"))
    }

    @Test
    fun isNullForAnythingThatIsNotATokenWithASubject() {
        assertNull(jwtSubject(null))
        assertNull(jwtSubject(""))
        assertNull(jwtSubject("not-a-jwt"))
        assertNull(jwtSubject("a.b"))
        assertNull(jwtSubject("a.!!!.c"))
        assertNull(jwtSubject(token("""{"exp":1}""")))
        assertNull(jwtSubject(token("""{"sub":42}""")))
        assertNull(jwtSubject(token("[1,2]")))
        assertNull(jwtSubject(token("not json")))
    }
}
