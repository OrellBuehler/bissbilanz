package com.bissbilanz.analytics

import kotlin.math.abs

data class FoodSleepImpact(
    val foodName: String,
    val foodId: String,
    val avgQualityWith: Double,
    val avgQualityWithout: Double,
    val delta: Double,
    val occurrences: Int,
    val pValue: Double,
    /** Benjamini–Hochberg adjusted p across every food screened. */
    val qValue: Double,
)

data class FoodSleepResult(
    /** Only foods whose effect survives FDR control and the minimum effect size. */
    val foodImpacts: List<FoodSleepImpact>,
    val overallAvgQuality: Double,
    /** Number of foods that were testable (enough nights with and without). */
    val comparisons: Int,
)

data class EveningFoodEntry(
    val date: String,
    val foodId: String,
    val foodName: String,
    val nutrients: Map<String, Double>,
)

data class SleepQualityPoint(
    val date: String,
    val quality: Double,
)

const val FOOD_SLEEP_MIN_OCCURRENCES: Int = 5
private const val MIN_NIGHTS_WITHOUT = 3
private const val MIN_EFFECT = 0.5
private const val FDR_LEVEL = 0.1

/**
 * Screens every evening food for a difference in next-night sleep quality. Each
 * food's Welch t-test is adjusted for the number of foods screened and only
 * foods clearing both the FDR threshold and a half-point minimum effect are
 * returned, so the user never sees the largest of many chance differences.
 */
fun detectFoodSleepPatterns(
    eveningFoods: List<EveningFoodEntry>,
    sleepData: List<SleepQualityPoint>,
    minOccurrences: Int = FOOD_SLEEP_MIN_OCCURRENCES,
): FoodSleepResult {
    if (sleepData.isEmpty()) return FoodSleepResult(foodImpacts = emptyList(), overallAvgQuality = 0.0, comparisons = 0)

    val sleepMap = LinkedHashMap<String, Double>()
    for (entry in sleepData) sleepMap[entry.date] = entry.quality

    val overallAvgQuality = mean(sleepData.map { it.quality })

    val foodsByIdName = LinkedHashMap<String, Pair<String, MutableSet<String>>>()
    for (food in eveningFoods) {
        if (!sleepMap.containsKey(food.date)) continue
        val existing = foodsByIdName.getOrPut(food.foodId) { Pair(food.foodName, mutableSetOf()) }
        existing.second.add(food.date)
    }

    class Candidate(
        val impact: FoodSleepImpact,
    )

    val candidates = mutableListOf<Candidate>()
    for ((foodId, pair) in foodsByIdName) {
        val (name, dates) = pair
        if (dates.size < minOccurrences) continue
        val withQuality = mutableListOf<Double>()
        val withoutQuality = mutableListOf<Double>()
        for ((date, quality) in sleepMap) {
            if (dates.contains(date)) withQuality.add(quality) else withoutQuality.add(quality)
        }
        if (withQuality.isEmpty() || withoutQuality.size < MIN_NIGHTS_WITHOUT) continue
        val avgQualityWith = mean(withQuality)
        val avgQualityWithout = mean(withoutQuality)
        val pValue = welchTTest(withQuality, withoutQuality).pValue
        candidates.add(
            Candidate(
                FoodSleepImpact(
                    foodName = name,
                    foodId = foodId,
                    avgQualityWith = avgQualityWith,
                    avgQualityWithout = avgQualityWithout,
                    delta = avgQualityWith - avgQualityWithout,
                    occurrences = dates.size,
                    pValue = pValue,
                    qValue = 1.0,
                ),
            ),
        )
    }

    val qValues = benjaminiHochberg(candidates.map { it.impact.pValue })
    val foodImpacts =
        candidates
            .mapIndexed { i, c -> c.impact.copy(qValue = qValues[i]) }
            .filter { abs(it.delta) >= MIN_EFFECT && it.qValue <= FDR_LEVEL }
            .sortedByDescending { abs(it.delta) }

    return FoodSleepResult(foodImpacts = foodImpacts, overallAvgQuality = overallAvgQuality, comparisons = candidates.size)
}
