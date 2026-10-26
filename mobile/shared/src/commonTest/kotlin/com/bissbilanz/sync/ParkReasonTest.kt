package com.bissbilanz.sync

import com.bissbilanz.test.testJson
import kotlin.test.Test
import kotlin.test.assertEquals

class ParkReasonTest {
    private fun reason(body: String?) = ParkReason.forConflict(body, testJson)

    @Test
    fun theBareDuplicateBarcodeCodeMapsToTheBarcodeReason() {
        assertEquals(ParkReason.BARCODE_IN_USE, reason("""{"error": "duplicate_barcode"}"""))
    }

    @Test
    fun aBarcodeMessageNamesTheFoodHoldingTheBarcode() {
        val body = """{"error": "A food with barcode 1 already exists: \"Skyr\""}"""

        assertEquals(ParkReason.BARCODE_IN_USE_BY_PREFIX + "Skyr", reason(body))
    }

    @Test
    fun anUnknownHolderFallsBackToTheNamelessBarcodeReason() {
        val body = """{"error": "A food with barcode 1 already exists: \"unknown\""}"""

        assertEquals(ParkReason.BARCODE_IN_USE, reason(body))
    }

    @Test
    fun aReadableServerMessageIsKept() {
        assertEquals("Name already taken", reason("""{"error": "Name already taken"}"""))
    }

    @Test
    fun unreadableBodiesAndBareCodesBecomeTheGenericConflict() {
        assertEquals(ParkReason.CONFLICT, reason("""{"error": "duplicate_entry"}"""))
        assertEquals(ParkReason.CONFLICT, reason("not json"))
        assertEquals(ParkReason.CONFLICT, reason(null))
        assertEquals(ParkReason.CONFLICT, reason("""{"error": "  "}"""))
    }

    @Test
    fun describeTurnsCodesIntoEnglishAndLeavesSentencesAlone() {
        assertEquals("this barcode is already used by another food", ParkReason.describe(ParkReason.BARCODE_IN_USE))
        assertEquals("HTTP 400", ParkReason.describe("HTTP 400"))
    }
}
