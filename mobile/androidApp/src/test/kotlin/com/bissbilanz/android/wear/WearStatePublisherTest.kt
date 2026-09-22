package com.bissbilanz.android.wear

import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.api.Status
import kotlinx.datetime.LocalDate
import java.io.IOException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class WearStatePublisherTest {
    @Test
    fun `detects a bare API_NOT_CONNECTED failure`() {
        val error = ApiException(Status(CommonStatusCodes.API_NOT_CONNECTED))

        assertTrue(error.isWearableApiUnavailable())
    }

    @Test
    fun `detects API_NOT_CONNECTED wrapped by the Data Layer`() {
        val error = RuntimeException("publish failed", ApiException(Status(CommonStatusCodes.API_NOT_CONNECTED)))

        assertTrue(error.isWearableApiUnavailable())
    }

    @Test
    fun `keeps reporting other Play services failures`() {
        val error = ApiException(Status(CommonStatusCodes.NETWORK_ERROR))

        assertFalse(error.isWearableApiUnavailable())
    }

    @Test
    fun `keeps reporting unrelated failures`() {
        assertFalse(IOException("socket closed").isWearableApiUnavailable())
    }

    @Test
    fun `offers the standard meals when nothing custom was logged`() {
        assertEquals(listOf("Breakfast", "Lunch", "Dinner", "Snacks"), watchMealTypes(listOf("Lunch", "Dinner")))
    }

    @Test
    fun `appends logged custom meal types alphabetically`() {
        assertEquals(
            listOf("Breakfast", "Lunch", "Dinner", "Snacks", "Post-workout", "Second breakfast"),
            watchMealTypes(listOf("Second breakfast", "Lunch", "Post-workout", "Second breakfast")),
        )
    }

    @Test
    fun `does not list an old lowercase default as a custom type`() {
        assertEquals(listOf("Breakfast", "Lunch", "Dinner", "Snacks"), watchMealTypes(listOf("snack", "breakfast")))
    }

    private fun day(value: String) = LocalDate.parse(value)

    @Test
    fun `compares against the weigh-in a week before the latest one`() {
        val history = listOf(day("2026-09-01") to 80.0, day("2026-09-08") to 79.0, day("2026-09-15") to 78.5)
        assertEquals(-0.5, sevenDayWeightDelta(day("2026-09-15"), 78.5, history))
    }

    @Test
    fun `anchors on the latest entry rather than today`() {
        val history = listOf(day("2026-08-01") to 82.0, day("2026-08-08") to 81.0)
        assertEquals(-1.0, sevenDayWeightDelta(day("2026-08-08"), 81.0, history))
    }

    @Test
    fun `accepts a comparison up to three days off and prefers the closest`() {
        val history = listOf(day("2026-09-05") to 80.0, day("2026-09-09") to 79.6, day("2026-09-15") to 79.0)
        assertEquals(-0.6, sevenDayWeightDelta(day("2026-09-15"), 79.0, history)!!, 1e-9)
    }

    @Test
    fun `a tie goes to the older weigh-in`() {
        val history = listOf(day("2026-09-05") to 80.0, day("2026-09-11") to 79.5, day("2026-09-15") to 79.0)
        assertEquals(-1.0, sevenDayWeightDelta(day("2026-09-15"), 79.0, history))
    }

    @Test
    fun `no delta without a weigh-in near a week back`() {
        val history = listOf(day("2026-08-20") to 80.0, day("2026-09-13") to 79.5, day("2026-09-15") to 79.0)
        assertNull(sevenDayWeightDelta(day("2026-09-15"), 79.0, history))
    }
}
