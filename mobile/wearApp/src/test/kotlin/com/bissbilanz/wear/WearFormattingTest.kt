package com.bissbilanz.wear

import com.bissbilanz.wear.screens.formatDelta
import com.bissbilanz.wear.screens.formatHours
import com.bissbilanz.wear.screens.formatKg
import com.bissbilanz.wear.screens.formatServings
import com.bissbilanz.wear.screens.progress
import kotlin.test.Test
import kotlin.test.assertEquals

class WearFormattingTest {
    @Test
    fun `progress guards against a missing goal`() {
        assertEquals(0f, progress(value = 1200.0, goal = 0.0))
        assertEquals(0f, progress(value = 1200.0, goal = -5.0))
    }

    @Test
    fun `progress clamps rather than overflowing the ring`() {
        assertEquals(1f, progress(value = 3000.0, goal = 2000.0))
        assertEquals(0.5f, progress(value = 1000.0, goal = 2000.0))
    }

    @Test
    fun `whole servings drop the decimal`() {
        assertEquals("1", formatServings(1.0))
        assertEquals("2", formatServings(2.0))
        assertEquals("1.5", formatServings(1.5))
    }

    @Test
    fun `weight rounds to one decimal`() {
        assertEquals("78.4", formatKg(78.44))
        assertEquals("78.5", formatKg(78.45))
    }

    @Test
    fun `delta is always signed so a gain reads differently from a loss`() {
        assertEquals("−0.3", formatDelta(-0.3))
        assertEquals("+0.3", formatDelta(0.3))
        assertEquals("+0.0", formatDelta(0.0))
    }

    @Test
    fun `hours drop a trailing zero`() {
        assertEquals("8", formatHours(8.0))
        assertEquals("7.5", formatHours(7.5))
    }
}
