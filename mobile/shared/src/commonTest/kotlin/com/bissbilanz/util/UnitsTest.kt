package com.bissbilanz.util

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class UnitsTest {
    private fun assertCloseTo(
        expected: Double,
        actual: Double,
        tolerance: Double = 1e-9,
    ) {
        assertTrue(
            kotlin.math.abs(expected - actual) < tolerance,
            "expected $expected to be close to $actual",
        )
    }

    @Test
    fun sameDimensionWithinMass() {
        assertTrue(isSameUnitDimension("g", "kg"))
    }

    @Test
    fun sameDimensionWithinVolume() {
        assertTrue(isSameUnitDimension("ml", "cup"))
    }

    @Test
    fun differentDimensionIsNotSame() {
        assertTrue(!isSameUnitDimension("g", "ml"))
        assertTrue(!isSameUnitDimension("cup", "lb"))
    }

    // Golden cases — must agree with src/lib/units.test.ts and the Swift test file.
    @Test
    fun gramsAndKilograms() {
        assertCloseTo(1000.0, unitConversionFactor("kg", "g")!!)
        assertCloseTo(0.001, unitConversionFactor("g", "kg")!!)
    }

    @Test
    fun ozToGramsExactFactor() {
        assertCloseTo(28.349523125, unitConversionFactor("oz", "g")!!)
    }

    @Test
    fun lbToGramsExactFactor() {
        assertCloseTo(453.59237, unitConversionFactor("lb", "g")!!)
    }

    @Test
    fun flOzToMlExactFactor() {
        assertCloseTo(29.5735295625, unitConversionFactor("fl_oz", "ml")!!)
    }

    @Test
    fun cupTbspTspMatchCodebaseWideFactors() {
        assertCloseTo(240.0, unitConversionFactor("cup", "ml")!!)
        assertCloseTo(15.0, unitConversionFactor("tbsp", "ml")!!)
        assertCloseTo(5.0, unitConversionFactor("tsp", "ml")!!)
    }

    @Test
    fun crossDimensionFactorIsNull() {
        assertNull(unitConversionFactor("g", "ml"))
        assertNull(unitConversionFactor("cup", "oz"))
    }

    @Test
    fun sameUnitFactorIsOne() {
        assertCloseTo(1.0, unitConversionFactor("tbsp", "tbsp")!!)
    }

    @Test
    fun convertTablespoonsToMl() {
        assertCloseTo(30.0, convertQuantityForMacros(2.0, "tbsp", "ml"))
    }

    @Test
    fun convertPoundsToGrams() {
        assertCloseTo(453.59237, convertQuantityForMacros(1.0, "lb", "g"))
    }

    @Test
    fun sameUnitIsNoOp() {
        assertEquals(150.0, convertQuantityForMacros(150.0, "g", "g"))
    }

    @Test
    fun crossDimensionFallsBackToRawQuantity() {
        assertEquals(2.0, convertQuantityForMacros(2.0, "cup", "g"))
        assertEquals(100.0, convertQuantityForMacros(100.0, "g", "ml"))
    }

    @Test
    fun compatibleUnitsExcludesOtherDimension() {
        val massUnits = compatibleUnits("g")
        assertTrue("g" in massUnits)
        assertTrue("kg" in massUnits)
        assertTrue("ml" !in massUnits)
    }
}
