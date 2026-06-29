package com.bissbilanz.label

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Kotlin port of the iOS `NutritionLabelParserTests`, kept case-for-case so the
 * two platforms are verified against the same labels.
 */
class NutritionLabelParserTest {
    // MARK: - Whole-label parsing

    @Test
    fun parsesGermanPanel() {
        val rows =
            listOf(
                "Nährwerte pro 100 g",
                "Energie 1569 kJ / 375 kcal",
                "Fett 4,5 g",
                "davon gesättigte Fettsäuren 1,2 g",
                "Kohlenhydrate 71,4 g",
                "davon Zucker 14,0 g",
                "Ballaststoffe 2,0 g",
                "Eiweiß 9,7 g",
                "Salz 1,28 g",
            )

        val parsed = NutritionLabelParser.parse(rows)

        assertEquals(375.0, parsed.calories)
        assertEquals(4.5, parsed.fat)
        assertEquals(1.2, parsed.saturatedFat)
        assertEquals(71.4, parsed.carbs)
        assertEquals(14.0, parsed.sugar)
        assertEquals(2.0, parsed.fiber)
        assertEquals(9.7, parsed.protein)
        assertEquals(1.28, parsed.salt)
    }

    @Test
    fun parsesEnglishEuPanel() {
        val rows =
            listOf(
                "Energy 1569 kJ / 375 kcal",
                "Fat 4.5 g",
                "of which saturates 1.2 g",
                "Carbohydrate 71.4 g",
                "of which sugars 14 g",
                "Fibre 2 g",
                "Protein 9.7 g",
                "Salt 1.28 g",
            )

        val parsed = NutritionLabelParser.parse(rows)

        assertEquals(375.0, parsed.calories)
        assertEquals(4.5, parsed.fat)
        assertEquals(1.2, parsed.saturatedFat)
        assertEquals(71.4, parsed.carbs)
        assertEquals(14.0, parsed.sugar)
        assertEquals(2.0, parsed.fiber)
        assertEquals(9.7, parsed.protein)
        assertEquals(1.28, parsed.salt)
    }

    @Test
    fun parsesUsPanel() {
        val rows =
            listOf(
                "Nutrition Facts",
                "Serving size 1 cup",
                "Calories 240",
                "Total Fat 8g 10%",
                "Saturated Fat 1g 5%",
                "Trans Fat 0g",
                "Sodium 200mg 9%",
                "Total Carbohydrate 37g 13%",
                "Dietary Fiber 4g 14%",
                "Total Sugars 12g",
                "Protein 3g",
            )

        val parsed = NutritionLabelParser.parse(rows)

        assertEquals(240.0, parsed.calories)
        assertEquals(8.0, parsed.fat) // first number wins over the %DV column
        assertEquals(1.0, parsed.saturatedFat)
        assertEquals(200.0, parsed.sodium) // mg kept as mg
        assertEquals(37.0, parsed.carbs)
        assertEquals(4.0, parsed.fiber)
        assertEquals(12.0, parsed.sugar)
        assertEquals(3.0, parsed.protein)
        assertNull(parsed.salt)
    }

    // MARK: - Energy

    @Test
    fun convertsKilojoulesOnly() {
        assertEquals(375.0, NutritionLabelParser.parse(listOf("Energie 1.569 kJ")).calories!!, 1e-6) // de thousands dot
        assertEquals(478.01, NutritionLabelParser.parse(listOf("Energy 2000 kJ")).calories!!, 1e-6)
    }

    @Test
    fun prefersKilocalories() {
        assertEquals(239.0, NutritionLabelParser.parse(listOf("Brennwert 1000 kJ 239 kcal")).calories)
    }

    // MARK: - Salt / sodium unit handling

    @Test
    fun sodiumGramsToMilligrams() {
        assertEquals(120.0, NutritionLabelParser.parse(listOf("Natrium 0,12 g")).sodium)
    }

    @Test
    fun saltMilligramsToGrams() {
        assertEquals(0.32, NutritionLabelParser.parse(listOf("Salt 320 mg")).salt)
    }

    // MARK: - Specificity / ordering

    @Test
    fun distinguishesSaturatedFromTotalFat() {
        val parsed = NutritionLabelParser.parse(listOf("Fat 10 g", "Saturated fat 3 g"))
        assertEquals(10.0, parsed.fat)
        assertEquals(3.0, parsed.saturatedFat)
    }

    @Test
    fun ofWhichSugarsMapsToSugar() {
        val parsed = NutritionLabelParser.parse(listOf("Carbohydrate 20 g", "of which sugars 8 g"))
        assertEquals(20.0, parsed.carbs)
        assertEquals(8.0, parsed.sugar)
    }

    @Test
    fun ignoresTransAndUnsaturatedFat() {
        // Order-independent: even if a sub-row is seen before "Total Fat".
        val us = NutritionLabelParser.parse(listOf("Trans Fat 0 g", "Total Fat 8 g"))
        assertEquals(8.0, us.fat)

        val de =
            NutritionLabelParser.parse(
                listOf(
                    "einfach ungesättigte Fettsäuren 6 g",
                    "mehrfach ungesättigte Fettsäuren 2 g",
                    "Fett 10 g",
                    "davon gesättigte Fettsäuren 3 g",
                ),
            )
        assertEquals(10.0, de.fat)
        assertEquals(3.0, de.saturatedFat)
    }

    @Test
    fun ignoresUnrelatedLines() {
        val parsed = NutritionLabelParser.parse(listOf("INGREDIENTS: water, salt", "Best before 2026"))
        assertTrue(parsed.isEmpty)
    }

    // MARK: - Number normalization

    @Test
    fun parseDecimalVariants() {
        assertEquals(4.5, NutritionLabelParser.parseDecimal("4,5"))
        assertEquals(4.5, NutritionLabelParser.parseDecimal("4.5"))
        assertEquals(1234.5, NutritionLabelParser.parseDecimal("1.234,5")) // EU grouping
        assertEquals(1234.5, NutritionLabelParser.parseDecimal("1,234.5")) // US grouping
        assertEquals(1569.0, NutritionLabelParser.parseDecimal("1 569")) // space grouping
        assertEquals(1569.0, NutritionLabelParser.parseDecimal("1.569", energyKJ = true))
        assertEquals(0.5, NutritionLabelParser.parseDecimal("0.5", energyKJ = true))
    }

    // MARK: - Row clustering

    @Test
    fun clustersColumnsIntoRows() {
        // Two visual rows, each split into a left label box and a right value box
        // that share a baseline (Vision coords: origin bottom-left).
        val lines =
            listOf(
                line("Protein", x = 0.1, y = 0.80),
                line("9.7 g", x = 0.7, y = 0.80),
                line("Fat", x = 0.1, y = 0.60),
                line("4.5 g", x = 0.7, y = 0.61),
            )

        val rows = NutritionLabelParser.assembleRows(lines)

        assertEquals(listOf("Protein 9.7 g", "Fat 4.5 g"), rows) // top row first, left-to-right
    }

    @Test
    fun clusteredRowsParse() {
        val lines =
            listOf(
                line("Protein", x = 0.1, y = 0.80),
                line("9.7 g", x = 0.7, y = 0.80),
                line("Fat", x = 0.1, y = 0.60),
                line("4.5 g", x = 0.7, y = 0.60),
            )

        val parsed = NutritionLabelParser.parse(lines)

        assertEquals(9.7, parsed.protein)
        assertEquals(4.5, parsed.fat)
    }

    // MARK: - Helpers

    private fun line(
        text: String,
        x: Double,
        y: Double,
        height: Double = 0.03,
    ): OcrTextLine =
        OcrTextLine(
            text = text,
            boundingBox = BoundingBox(x = x, y = y - height / 2, width = 0.2, height = height),
        )
}
