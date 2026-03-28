package com.bissbilanz.analytics

import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

data class MealRegularityEntry(
    val mealType: String,
    val avgMinute: Double,
    val stddevMinutes: Double,
    val regularity: String,
)

data class MealRegularityResult(
    val meals: List<MealRegularityEntry>,
    val overallScore: Double,
    val confidence: ConfidenceLevel,
    val sampleSize: Int,
)

data class RegularityInputEntry(
    val date: String,
    val mealType: String,
    val eatenAt: String?,
)

fun computeMealRegularity(entries: List<RegularityInputEntry>): MealRegularityResult {
    val byMealDate = mutableMapOf<String, MutableMap<String, Int>>()
    for (entry in entries) {
        if (entry.eatenAt == null) continue
        val minutes = parseLocalMinutes(entry.eatenAt) ?: continue
        val dateMap = byMealDate.getOrPut(entry.mealType) { mutableMapOf() }
        val existing = dateMap[entry.date]
        if (existing == null || minutes < existing) dateMap[entry.date] = minutes
    }

    val byMealType = mutableMapOf<String, List<Int>>()
    for ((mealType, dateMap) in byMealDate) byMealType[mealType] = dateMap.values.toList()

    val dates = mutableSetOf<String>()
    for (entry in entries) {
        if (entry.eatenAt != null) dates.add(entry.date)
    }
    val sampleSize = dates.size

    if (byMealType.isEmpty()) {
        return MealRegularityResult(meals = emptyList(), overallScore = 0.0, confidence = ConfidenceLevel.INSUFFICIENT, sampleSize = 0)
    }

    val mealResults = mutableListOf<MealRegularityEntry>()
    val stddevValues = mutableListOf<Double>()

    for ((mealType, minutesList) in byMealType) {
        val n = minutesList.size
        val avgMinute = minutesList.sumOf { it.toDouble() } / n
        val variance = minutesList.sumOf { (it - avgMinute) * (it - avgMinute) } / n
        val stddevMinutes = sqrt(variance)
        val regularity =
            when {
                stddevMinutes < 30 -> "high"
                stddevMinutes < 60 -> "medium"
                else -> "low"
            }
        mealResults.add(
            MealRegularityEntry(mealType = mealType, avgMinute = avgMinute, stddevMinutes = stddevMinutes, regularity = regularity),
        )
        stddevValues.add(stddevMinutes)
    }

    val meanStddev = stddevValues.sum() / stddevValues.size
    val overallScore = max(0.0, min(100.0, 100.0 - meanStddev / 1.2))

    return MealRegularityResult(
        meals = mealResults,
        overallScore = overallScore,
        confidence = getConfidenceLevel(sampleSize),
        sampleSize = sampleSize,
    )
}
