package com.bissbilanz.analytics

import kotlin.math.max
import kotlin.math.sqrt

data class ProteinDistributionResult(
    val score: Double,
    val avgPerMeal: Double,
    val mealsPerDay: Double,
    val mealsBelowThreshold: Int,
    val totalMeals: Int,
    val confidence: ConfidenceLevel,
    val sampleSize: Int,
)

fun computeProteinDistribution(
    entries: List<Triple<String, String, Double>>,
    threshold: Double = 20.0,
): ProteinDistributionResult {
    val byDateMeal = mutableMapOf<String, Double>()
    for ((date, mealType, protein) in entries) {
        val key = "${date}__$mealType"
        byDateMeal[key] = (byDateMeal[key] ?: 0.0) + protein
    }
    val byDate = mutableMapOf<String, MutableList<Double>>()
    for ((key, protein) in byDateMeal) {
        val date = key.split("__")[0]
        byDate.getOrPut(date) { mutableListOf() }.add(protein)
    }
    val sampleSize = byDate.size
    if (sampleSize == 0) {
        return ProteinDistributionResult(
            score = 0.0,
            avgPerMeal = 0.0,
            mealsPerDay = 0.0,
            mealsBelowThreshold = 0,
            totalMeals = 0,
            confidence = ConfidenceLevel.INSUFFICIENT,
            sampleSize = 0,
        )
    }
    val cvValues = mutableListOf<Double>()
    var totalProtein = 0.0
    var totalMeals = 0
    var mealsBelowThreshold = 0
    for (meals in byDate.values) {
        totalProtein += meals.sum()
        totalMeals += meals.size
        mealsBelowThreshold += meals.count { it < threshold }
        if (meals.size > 1) {
            val mean = meals.sum() / meals.size
            if (mean > 0) {
                val variance = meals.sumOf { (it - mean) * (it - mean) } / meals.size
                val stddev = sqrt(variance)
                cvValues.add(stddev / mean)
            } else {
                cvValues.add(0.0)
            }
        } else {
            cvValues.add(0.0)
        }
    }
    val meanCV = cvValues.sum() / cvValues.size
    val score = max(0.0, 100.0 - meanCV * 100.0)
    return ProteinDistributionResult(
        score = score,
        avgPerMeal = if (totalMeals > 0) totalProtein / totalMeals else 0.0,
        mealsPerDay = totalMeals.toDouble() / sampleSize,
        mealsBelowThreshold = mealsBelowThreshold,
        totalMeals = totalMeals,
        confidence = getConfidenceLevel(sampleSize),
        sampleSize = sampleSize,
    )
}
