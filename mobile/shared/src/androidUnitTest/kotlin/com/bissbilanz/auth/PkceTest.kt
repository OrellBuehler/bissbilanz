package com.bissbilanz.auth

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class PkceTest {
    @Test
    fun challengeMatchesRfc7636TestVector() {
        assertEquals(
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
            Pkce.challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
        )
    }

    @Test
    fun sha256MatchesKnownDigests() {
        fun hex(bytes: ByteArray) = bytes.joinToString("") { (it.toInt() and 0xff).toString(16).padStart(2, '0') }
        assertEquals(
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            hex(sha256(ByteArray(0))),
        )
        assertEquals(
            "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
            hex(sha256("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq".encodeToByteArray())),
        )
    }

    @Test
    fun verifierUsesOnlyUnreservedCharactersWithinAllowedLength() {
        val verifier = Pkce.generateVerifier()
        assertTrue(verifier.length in 43..128)
        assertTrue(verifier.all { it in 'A'..'Z' || it in 'a'..'z' || it in '0'..'9' || it in "-._~" })
    }

    @Test
    fun verifiersDiffer() {
        assertNotEquals(Pkce.generateVerifier(), Pkce.generateVerifier())
    }

    @Test
    fun challengeIsFortyThreeUnpaddedBase64UrlCharacters() {
        val challenge = Pkce.challengeFor(Pkce.generateVerifier())
        assertEquals(43, challenge.length)
        assertTrue(challenge.all { it in 'A'..'Z' || it in 'a'..'z' || it in '0'..'9' || it == '-' || it == '_' })
    }
}
