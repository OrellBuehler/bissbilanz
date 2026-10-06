package com.bissbilanz.auth

import com.bissbilanz.util.Failures
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi

private val claimsParser = Json { isLenient = false }

/**
 * The `sub` claim of an access token: who the session belongs to. Only used to tell accounts
 * apart on this device, never to trust a token, so the signature is not checked. Null for
 * anything that is not a three-part JWT with a string `sub`.
 */
@OptIn(ExperimentalEncodingApi::class)
fun jwtSubject(token: String?): String? {
    val payload = token?.split('.')?.takeIf { it.size == 3 }?.get(1) ?: return null
    val decoded =
        try {
            Base64.UrlSafe
                .withPadding(Base64.PaddingOption.ABSENT_OPTIONAL)
                .decode(payload)
                .decodeToString()
        } catch (e: IllegalArgumentException) {
            Failures.report(e)
            return null
        }
    val claims =
        try {
            claimsParser.parseToJsonElement(decoded) as? JsonObject
        } catch (e: SerializationException) {
            Failures.report(e)
            return null
        }
    return (claims?.get("sub") as? JsonPrimitive)?.takeIf { it.isString }?.content
}
