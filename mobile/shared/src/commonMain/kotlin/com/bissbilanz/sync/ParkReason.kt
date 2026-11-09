package com.bissbilanz.sync

import com.bissbilanz.util.decodeOrNull
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Why a queued change was parked, in a form the UI can localize. Reasons that are plain
 * English sentences (and a server message that has spaces) are shown as they are; the
 * codes below are mapped to strings by the pending-changes screen.
 */
object ParkReason {
    /** The barcode belongs to another food, whose name the server did not give. */
    const val BARCODE_IN_USE = "barcode_in_use"

    /** The barcode belongs to another food; the name follows the prefix. */
    const val BARCODE_IN_USE_BY_PREFIX = "barcode_in_use_by:"

    /** A 409 whose body says nothing readable. */
    const val CONFLICT = "conflict"

    private const val DUPLICATE_BARCODE_CODE = "duplicate_barcode"
    private const val BARCODE_MESSAGE_PREFIX = "A food with barcode"
    private const val BARCODE_MESSAGE_MARKER = "already exists"
    private const val UNKNOWN_FOOD_NAME = "unknown"

    @Serializable
    private data class ErrorBody(
        val error: String? = null,
    )

    /**
     * The reason for a 409 without an `X-Sync-Conflict` header, read from the server's
     * `{error}` body: a duplicate barcode (`foods.ts` names the food that holds it, the
     * bare `duplicate_barcode` code appears when the lookup was unavailable), another
     * human-readable server message, or [CONFLICT].
     */
    fun forConflict(
        responseBody: String?,
        json: Json,
    ): String {
        val message =
            responseBody
                ?.let { json.decodeOrNull<ErrorBody>(it) }
                ?.error
                ?.trim()
                .orEmpty()
        return when {
            message.isEmpty() -> CONFLICT
            message == DUPLICATE_BARCODE_CODE -> BARCODE_IN_USE
            message.startsWith(BARCODE_MESSAGE_PREFIX) && BARCODE_MESSAGE_MARKER in message -> barcodeReason(message)
            ' ' in message -> message
            else -> CONFLICT
        }
    }

    private fun barcodeReason(message: String): String {
        val open = message.indexOf('"')
        val close = message.lastIndexOf('"')
        val name = if (open in 0 until close) message.substring(open + 1, close) else ""
        return if (name.isEmpty() || name == UNKNOWN_FOOD_NAME) BARCODE_IN_USE else BARCODE_IN_USE_BY_PREFIX + name
    }

    /** English wording for logs and the sync banner; the Android pending screen localizes instead. */
    fun describe(reason: String): String =
        when {
            reason == BARCODE_IN_USE -> "this barcode is already used by another food"
            reason.startsWith(
                BARCODE_IN_USE_BY_PREFIX,
            ) -> "this barcode is already used by \"${reason.removePrefix(BARCODE_IN_USE_BY_PREFIX)}\""
            reason == CONFLICT -> "the server found a conflict with existing data"
            else -> reason
        }
}
