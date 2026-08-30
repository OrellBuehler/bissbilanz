package com.bissbilanz.analytics

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class FoodQualityTest {
    @Test
    fun novaGroup4OnlyIs100PctUltraProcessed() {
        val entries =
            listOf(
                Pair(500.0, 4),
                Pair(300.0, 4),
                Pair(200.0, 4),
            )
        val result = computeNOVAScore(entries)
        assertEquals(100.0, result.ultraProcessedPct)
    }

    @Test
    fun novaMixedGroups() {
        val entries =
            listOf(
                Pair(500.0, 1),
                Pair(500.0, 4),
            )
        val result = computeNOVAScore(entries)
        assertEquals(50.0, result.ultraProcessedPct)
        assertEquals(100.0, result.coveragePct)
    }

    @Test
    fun novaWithNullGroupsReducesCoverage() {
        val entries =
            listOf(
                Pair(500.0, null),
                Pair(500.0, 4),
            )
        val result = computeNOVAScore(entries)
        assertEquals(50.0, result.coveragePct)
    }

    @Test
    fun novaLowCoverageDowngradesConfidence() {
        val entries = (1..30).map { Pair(100.0, if (it <= 2) 4 else null) }
        val result = computeNOVAScore(entries)
        assertTrue(result.coveragePct < 30.0)
        assertEquals(ConfidenceLevel.LOW, result.confidence)
    }

    @Test
    fun novaEmptyReturnsZero() {
        val result = computeNOVAScore(emptyList())
        assertEquals(0.0, result.ultraProcessedPct)
        assertEquals(ConfidenceLevel.INSUFFICIENT, result.confidence)
    }

    @Test
    fun omegaRatioOptimal() {
        val days =
            listOf(
                OmegaDay("2024-01-01", 2.0, 4.0),
                OmegaDay("2024-01-02", 2.0, 4.0),
                OmegaDay("2024-01-03", 2.0, 4.0),
            )
        val result = computeOmegaRatio(days)
        assertEquals("optimal", result.status)
        assertEquals(2.0, result.ratio)
    }

    @Test
    fun omegaRatioHighAbove20() {
        val days = listOf(OmegaDay("2024-01-01", 0.5, 15.0))
        val result = computeOmegaRatio(days)
        assertEquals("high", result.status)
        assertTrue(result.ratio!! > 20.0)
    }

    @Test
    fun omegaRatioAtTheAdequateIntakeProportionsIsOptimal() {
        // 17 g n-6 / 1.6 g n-3 (male AI) ≈ 10.6:1 — the app's own reference table.
        assertEquals("optimal", computeOmegaRatio(listOf(OmegaDay("2024-01-01", 1.6, 17.0))).status)
    }

    @Test
    fun omegaRatioElevated() {
        val days = listOf(OmegaDay("2024-01-01", 1.0, 15.0))
        assertEquals("elevated", computeOmegaRatio(days).status)
    }

    @Test
    fun omegaRatioFiltersZeroValuesAndLowCoverage() {
        val days =
            listOf(
                OmegaDay("2024-01-01", 0.0, 8.0),
                OmegaDay("2024-01-02", 1.0, 4.0),
                OmegaDay("2024-01-03", 0.2, 20.0, coverage = 0.3),
            )
        val result = computeOmegaRatio(days)
        assertEquals(1, result.sampleSize)
        assertEquals(4.0, result.ratio!!, 1e-9)
    }

    @Test
    fun diiScoreAtGlobalMeanIsZero() {
        // Shivappa et al. 2014 Table 2 means; caffeine is tabulated in g (8.05 g = 8050 mg).
        val days =
            (1..10).map {
                DIIInput(
                    fiber = 18.8,
                    omega3 = 1.06,
                    vitaminC = 118.2,
                    vitaminD = 6.26,
                    vitaminE = 8.73,
                    saturatedFat = 28.6,
                    transFat = 3.15,
                    alcohol = 13.98,
                    caffeine = 8050.0,
                )
            }
        val result = computeDIIScore(days)
        assertTrue(abs(result.score) < 1e-6, "Score at global mean should be 0, got ${result.score}")
        assertEquals("neutral", result.classification)
        assertEquals(3.378 / 13.152, result.coverageFraction, 1e-9)
    }

    @Test
    fun diiAntiInflammatory() {
        val days =
            (1..10).map {
                DIIInput(
                    fiber = 35.0,
                    omega3 = 3.0,
                    vitaminC = 200.0,
                    vitaminD = 15.0,
                    vitaminE = 20.0,
                    saturatedFat = 10.0,
                    transFat = 0.5,
                    alcohol = 0.0,
                    caffeine = 50.0,
                )
            }
        val result = computeDIIScore(days)
        assertTrue(result.score < -result.neutralBand, "Expected anti-inflammatory, got score=${result.score}")
        assertEquals("anti-inflammatory", result.classification)
    }

    @Test
    fun diiProInflammatory() {
        val days =
            (1..10).map {
                DIIInput(
                    fiber = 5.0,
                    omega3 = 0.3,
                    vitaminC = 20.0,
                    vitaminD = 1.0,
                    vitaminE = 2.0,
                    saturatedFat = 50.0,
                    transFat = 8.0,
                    alcohol = 0.0,
                    caffeine = 500.0,
                )
            }
        val result = computeDIIScore(days)
        assertTrue(result.score > result.neutralBand, "Expected pro-inflammatory, got score=${result.score}")
        assertEquals("pro-inflammatory", result.classification)
    }

    @Test
    fun diiContributionsAreBoundedAndAlcoholIsAntiInflammatory() {
        val extreme = computeDIIScore((1..7).map { DIIInput(fiber = 5000.0) })
        assertEquals(-0.663, extreme.contributors[0].impact, 1e-6)
        val moderate = computeDIIScore((1..7).map { DIIInput(alcohol = 13.98 + 3.72) })
        assertTrue(moderate.contributors[0].impact < 0)
    }

    @Test
    fun diiSkipsDaysUnderTheCoverageFloor() {
        val days =
            (0 until 10).map { i ->
                DIIInput(
                    fiber = if (i < 5) 40.0 else 5.0,
                    coverage = mapOf("fiber" to if (i < 5) 1.0 else 0.3),
                )
            }
        val result = computeDIIScore(days)
        assertTrue(result.contributors[0].impact < -0.6)
    }

    @Test
    fun tefCalculationKnownValues() {
        // 30g protein, 50g carbs, 20g fat
        // TEF = 30*4*0.25 + 50*4*0.08 + 20*9*0.03 = 30 + 16 + 5.4 = 51.4
        val input = TEFInput(protein = 30.0, carbs = 50.0, fat = 20.0, calories = 500.0)
        val result = computeTEF(listOf(input))
        assertEquals(51.4, result.avgTEF, absoluteTolerance = 0.001)
    }

    @Test
    fun tefEmptyReturnsZero() {
        val result = computeTEF(emptyList())
        assertEquals(0.0, result.avgTEF)
        assertEquals(0.0, result.avgTEFPct)
        assertEquals(ConfidenceLevel.INSUFFICIENT, result.confidence)
    }

    @Test
    fun novaSingleEntry() {
        val result = computeNOVAScore(listOf(Pair(200.0, 4)))
        assertEquals(100.0, result.ultraProcessedPct, 1e-9)
        assertEquals(1, result.sampleSize)
    }

    @Test
    fun novaAllNullGroups() {
        val entries = listOf(Pair(200.0, null as Int?), Pair(300.0, null))
        val result = computeNOVAScore(entries)
        assertEquals(0.0, result.ultraProcessedPct)
        assertEquals(0.0, result.coveragePct)
        assertEquals(2, result.sampleSize)
    }

    @Test
    fun omegaSingleDay() {
        val result = computeOmegaRatio(listOf(OmegaDay("2024-01-01", 2.0, 8.0)))
        assertEquals(4.0, result.ratio!!, 1e-9)
        assertEquals("optimal", result.status)
        assertEquals(1, result.sampleSize)
    }

    @Test
    fun omegaBothZeroFiltered() {
        val result = computeOmegaRatio(listOf(OmegaDay("2024-01-01", 0.0, 0.0)))
        assertEquals(0, result.sampleSize)
        assertEquals("insufficient", result.status)
    }

    @Test
    fun omegaOnlyOmega3ZeroFiltered() {
        val result = computeOmegaRatio(listOf(OmegaDay("2024-01-01", 0.0, 10.0)))
        assertEquals(0, result.sampleSize)
    }

    @Test
    fun diiAllNullNutrientsReturnsNeutral() {
        val entries =
            listOf(
                DIIInput(),
                DIIInput(),
                DIIInput(),
            )
        val result = computeDIIScore(entries)
        assertEquals(0.0, result.score)
        assertEquals("neutral", result.classification)
        assertEquals(emptyList(), result.contributors)
    }

    @Test
    fun diiSingleDay() {
        val result = computeDIIScore(listOf(DIIInput(fiber = 30.0, omega3 = 2.0)))
        assertEquals(1, result.sampleSize)
        assertTrue(result.score < 0)
    }

    @Test
    fun tefSingleDay() {
        val result = computeTEF(listOf(TEFInput(protein = 100.0, carbs = 250.0, fat = 80.0, calories = 2000.0)))
        assertEquals(1, result.sampleSize)
        assertEquals(201.6, result.avgTEF, 1e-9)
        assertEquals(201.6 / 2000.0 * 100.0, result.avgTEFPct, 1e-9)
    }

    @Test
    fun tefAlcoholAddsItsOwnThermicCost() {
        val dry = computeTEF(listOf(TEFInput(100.0, 200.0, 70.0, 2000.0)))
        val wet = computeTEF(listOf(TEFInput(100.0, 200.0, 70.0, 2280.0, alcohol = 40.0)))
        assertEquals(40.0 * 7.0 * 0.2, wet.avgTEF - dry.avgTEF, 1e-9)
    }

    @Test
    fun novaReportsUntaggedCaloriesAsUnknownOverTheTotal() {
        val result = computeNOVAScore(listOf(Pair(200.0, 4), Pair(800.0, null)))
        assertEquals(20.0, result.ultraProcessedPct, 1e-9)
        assertEquals(80.0, result.unknownPct, 1e-9)
        assertEquals(20.0, result.coveragePct, 1e-9)
    }

    @Test
    fun tefZeroCaloriesReturnZeroPct() {
        val result = computeTEF(listOf(TEFInput(protein = 0.0, carbs = 0.0, fat = 0.0, calories = 0.0)))
        assertEquals(0.0, result.avgTEFPct)
    }
}
