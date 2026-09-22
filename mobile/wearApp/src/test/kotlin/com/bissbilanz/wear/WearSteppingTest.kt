package com.bissbilanz.wear

import com.bissbilanz.wear.screens.rotarySteps
import com.bissbilanz.wear.screens.stepHours
import com.bissbilanz.wear.screens.stepServings
import com.bissbilanz.wear.screens.stepWeight
import kotlin.test.Test
import kotlin.test.assertEquals

class WearSteppingTest {
    @Test
    fun `a partial turn carries over instead of stepping`() {
        assertEquals(0, rotarySteps(pixels = 40f, stepPixels = 64f))
        assertEquals(1, rotarySteps(pixels = 64f, stepPixels = 64f))
        assertEquals(2, rotarySteps(pixels = 140f, stepPixels = 64f))
        assertEquals(-1, rotarySteps(pixels = -70f, stepPixels = 64f))
    }

    @Test
    fun `an unknown scroll factor never steps`() {
        assertEquals(0, rotarySteps(pixels = 500f, stepPixels = 0f))
    }

    @Test
    fun `weight steps in tenths without drifting`() {
        var weight = 70.0
        repeat(30) { weight = stepWeight(weight, 1) }
        assertEquals(73.0, weight)
        assertEquals(72.5, stepWeight(73.0, -5))
    }

    @Test
    fun `weight stays within its range`() {
        assertEquals(20.0, stepWeight(20.1, -5))
        assertEquals(400.0, stepWeight(399.9, 5))
    }

    @Test
    fun `servings step by halves within range`() {
        assertEquals(2.0, stepServings(1.0, 2))
        assertEquals(0.5, stepServings(1.0, -4))
        assertEquals(20.0, stepServings(19.5, 3))
    }

    @Test
    fun `sleep hours step by halves within a day`() {
        assertEquals(8.5, stepHours(8.0, 1))
        assertEquals(0.5, stepHours(1.0, -3))
        assertEquals(24.0, stepHours(23.5, 4))
    }
}
