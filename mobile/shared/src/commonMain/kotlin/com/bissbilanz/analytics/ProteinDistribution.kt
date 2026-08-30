package com.bissbilanz.analytics

import kotlin.math.max
import kotlin.math.sqrt

data class ProteinDistributionResult(
    val score: Double,
    val avgPerMeal: Double,
    val mealsPerDay: Double,
    val mealsBelowThreshold: Int,
    val totalMeals: Int,
    /** The per-meal protein bar the "below" count was taken against. */
    val threshold: Double,
    val confidence: ConfidenceLevel,
    val sampleSize: Int,
)

/**
 * Per-meal protein needed to maximally stimulate muscle protein synthesis,
 * ~0.4 g/kg (Moore 2015, Schoenfeld & Aragon 2018). Falls back to a flat 20 g
 * when body weight is unknown.
 */
fun proteinPerMealThreshold(bodyWeightKg: Double?): Double {
    if (bodyWeightKg == null || bodyWeightKg <= 0) return PROTEIN_DEFAULT_PER_MEAL_G
    return max(PROTEIN_DEFAULT_PER_MEAL_G, PROTEIN_PER_MEAL_G_PER_KG * bodyWeightKg)
}

/**
 * Evenness of protein across the day's feedings. Each day is scored by the
 * coefficient of variation across its meals *padded with zeros to the target
 * feeding count* (three), so a single large sitting scores as the skewed
 * pattern Mamerow et al. 2014 found inferior — not as perfectly even.
 */
fun computeProteinDistribution(
    entries: List<Triple<String, String, Double>>,
    threshold: Double = PROTEIN_DEFAULT_PER_MEAL_G,
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
            threshold = threshold,
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
        val padded = meals.toMutableList()
        while (padded.size < PROTEIN_TARGET_FEEDINGS_PER_DAY) padded.add(0.0)
        val mean = padded.sum() / padded.size
        if (mean > 0) {
            val variance = padded.sumOf { (it - mean) * (it - mean) } / padded.size
            cvValues.add(sqrt(variance) / mean)
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
        threshold = threshold,
        confidence = getConfidenceLevel(sampleSize),
        sampleSize = sampleSize,
    )
}
