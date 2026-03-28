package com.bissbilanz.analytics

import kotlin.math.abs

data class NutrientCorrelation(
    val nutrientKey: String,
    val correlation: CorrelationResult,
)

fun computeNutrientOutcomeCorrelations(
    dailyNutrients: List<Pair<String, Map<String, Double?>>>,
    outcomes: List<Pair<String, Double>>,
    lagDays: Int = 0,
): List<NutrientCorrelation> {
    val outcomeMap = mutableMapOf<String, Double>()
    for ((date, value) in outcomes) outcomeMap[date] = value
    val allKeys = mutableSetOf<String>()
    for ((_, nutrients) in dailyNutrients) allKeys.addAll(nutrients.keys)
    val results = mutableListOf<NutrientCorrelation>()
    for (key in allKeys) {
        val totalDays = dailyNutrients.size
        val nullCount = dailyNutrients.count { (_, nutrients) -> nutrients[key] == null }
        if (totalDays > 0 && nullCount.toDouble() / totalDays > 0.5) continue
        val xValues = mutableListOf<Double>()
        val yValues = mutableListOf<Double>()
        for ((date, nutrients) in dailyNutrients) {
            val nv = nutrients[key] ?: continue
            val outcomeDate = if (lagDays == 0) date else shiftDate(date, lagDays)
            val outcome = outcomeMap[outcomeDate] ?: continue
            xValues.add(nv)
            yValues.add(outcome)
        }
        if (xValues.size < 2) continue
        val corr = pearsonCorrelation(xValues.toDoubleArray(), yValues.toDoubleArray())
        if (abs(corr.r) >= 0.15) results.add(NutrientCorrelation(nutrientKey = key, correlation = corr))
    }
    return results.sortedByDescending { abs(it.correlation.r) }
}
