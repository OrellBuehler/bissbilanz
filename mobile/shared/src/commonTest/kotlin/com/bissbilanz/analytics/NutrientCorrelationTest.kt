package com.bissbilanz.analytics

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

private fun pad2(n: Int): String = n.toString().padStart(2, '0')

class NutrientCorrelationTest {
    private fun makeDailyNutrients(
        dates: List<String>,
        nutrients: Map<String, List<Double?>>,
    ): List<Pair<String, Map<String, Double?>>> =
        dates.mapIndexed { i, date ->
            date to nutrients.mapValues { (_, values) -> values[i] }
        }

    @Test
    fun emptyInputsReturnEmptyList() {
        val result =
            computeNutrientOutcomeCorrelations(
                dailyNutrients = emptyList(),
                outcomes = emptyList(),
            )
        assertEquals(0, result.size)
    }

    @Test
    fun singleDataPointReturnEmpty() {
        val nutrients =
            makeDailyNutrients(
                listOf("2024-01-01"),
                mapOf("protein" to listOf(50.0)),
            )
        val outcomes = listOf("2024-01-01" to 80.0)
        val result = computeNutrientOutcomeCorrelations(nutrients, outcomes)
        assertEquals(0, result.size)
    }

    @Test
    fun skipsNutrientWithMoreThanHalfNull() {
        val dates = (1..10).map { "2024-01-${pad2(it)}" }
        val nutrients =
            makeDailyNutrients(
                dates,
                mapOf(
                    "protein" to dates.indices.map { 50.0 + it },
                    "sparse" to dates.indices.map { if (it < 4) it.toDouble() else null },
                ),
            )
        val outcomes = dates.map { it to 80.0 }
        val result = computeNutrientOutcomeCorrelations(nutrients, outcomes)
        assertTrue(result.none { it.nutrientKey == "sparse" })
    }

    @Test
    fun filtersOutWeakCorrelationsBelow015() {
        val dates = (1..20).map { "2024-01-${pad2(it)}" }
        val nutrients =
            makeDailyNutrients(
                dates,
                mapOf("random" to dates.indices.map { if (it % 2 == 0) 100.0 else 100.1 }),
            )
        val outcomes = dates.map { it to 80.0 + it.takeLast(2).toInt() * 0.001 }
        val result = computeNutrientOutcomeCorrelations(nutrients, outcomes)
        assertTrue(result.all { abs(it.correlation.r) >= 0.15 })
    }

    @Test
    fun strongCorrelationIsReturned() {
        val dates = (1..15).map { "2024-01-${pad2(it)}" }
        val nutrients =
            makeDailyNutrients(
                dates,
                mapOf("protein" to dates.indices.map { 50.0 + it * 2.0 }),
            )
        val outcomes = dates.map { it to 80.0 - it.takeLast(2).toInt() * 0.1 }
        val result = computeNutrientOutcomeCorrelations(nutrients, outcomes)
        assertTrue(result.any { it.nutrientKey == "protein" })
        val proteinCorr = result.first { it.nutrientKey == "protein" }
        assertTrue(abs(proteinCorr.correlation.r) > 0.5)
    }

    @Test
    fun resultsSortedByAbsoluteCorrelation() {
        val dates = (1..20).map { "2024-01-${pad2(it)}" }
        val nutrients =
            makeDailyNutrients(
                dates,
                mapOf(
                    "strong" to dates.indices.map { it * 10.0 },
                    "moderate" to dates.indices.map { it * 5.0 + (it % 3) * 20.0 },
                ),
            )
        val outcomes = dates.map { it to it.takeLast(2).toInt().toDouble() }
        val result = computeNutrientOutcomeCorrelations(nutrients, outcomes)
        if (result.size >= 2) {
            for (i in 0 until result.size - 1) {
                assertTrue(
                    abs(result[i].correlation.r) >= abs(result[i + 1].correlation.r),
                )
            }
        }
    }

    @Test
    fun lagShiftsOutcomeDateCorrectly() {
        val dates = (1..15).map { "2024-01-${pad2(it)}" }
        val nutrients =
            makeDailyNutrients(
                dates,
                mapOf("fiber" to dates.indices.map { 20.0 + it * 1.0 }),
            )
        val outcomeDates = (2..16).map { "2024-01-${pad2(it)}" }
        val outcomes = outcomeDates.map { it to 80.0 - it.takeLast(2).toInt() * 0.1 }
        val result = computeNutrientOutcomeCorrelations(nutrients, outcomes, lagDays = 1)
        assertTrue(result.any { it.nutrientKey == "fiber" })
    }
}
