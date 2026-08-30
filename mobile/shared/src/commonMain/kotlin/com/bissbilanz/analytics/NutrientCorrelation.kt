package com.bissbilanz.analytics

import kotlin.math.abs

data class NutrientCorrelation(
    val nutrientKey: String,
    val correlation: CorrelationResult,
    /** Benjamini–Hochberg adjusted p across every nutrient screened. */
    val qValue: Double,
    /** Number of nutrients that were testable in this screen. */
    val comparisons: Int,
)

private const val MIN_PAIRS = 7
private const val MIN_ABS_R = 0.15
private const val FDR_LEVEL = 0.1

/**
 * Screens every nutrient key against a daily outcome with Benjamini–Hochberg
 * control across the keys tested, returning only those under the FDR threshold,
 * most extreme first. Callers pairing a nutrient with body weight should pass
 * day-over-day weight *changes* as the outcome.
 */
fun computeNutrientOutcomeCorrelations(
    dailyNutrients: List<Pair<String, Map<String, Double?>>>,
    outcomes: List<Pair<String, Double>>,
    lagDays: Int = 0,
): List<NutrientCorrelation> {
    val outcomeMap = mutableMapOf<String, Double>()
    for ((date, value) in outcomes) outcomeMap[date] = value
    val allKeys = LinkedHashSet<String>()
    for ((_, nutrients) in dailyNutrients) allKeys.addAll(nutrients.keys)
    val tested = mutableListOf<Pair<String, CorrelationResult>>()
    for (key in allKeys) {
        val totalDays = dailyNutrients.size
        val nullCount = dailyNutrients.count { (_, nutrients) -> nutrients[key] == null }
        if (totalDays == 0 || nullCount.toDouble() / totalDays > 0.5) continue
        val xValues = mutableListOf<Double>()
        val yValues = mutableListOf<Double>()
        for ((date, nutrients) in dailyNutrients) {
            val nv = nutrients[key] ?: continue
            val outcomeDate = if (lagDays == 0) date else shiftDate(date, lagDays)
            val outcome = outcomeMap[outcomeDate] ?: continue
            xValues.add(nv)
            yValues.add(outcome)
        }
        if (xValues.size < MIN_PAIRS) continue
        tested.add(Pair(key, pearsonCorrelation(xValues.toDoubleArray(), yValues.toDoubleArray())))
    }
    val qValues = benjaminiHochberg(tested.map { it.second.pValue })
    return tested
        .mapIndexed { i, (key, corr) -> NutrientCorrelation(key, corr, qValues[i], tested.size) }
        .filter { abs(it.correlation.r) >= MIN_ABS_R && it.qValue <= FDR_LEVEL }
        .sortedByDescending { abs(it.correlation.r) }
}
