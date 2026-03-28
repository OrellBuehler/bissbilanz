package com.bissbilanz.analytics

import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.minus

data class WeeklyDiversityEntry(
    val weekStart: String,
    val uniqueFoods: Int,
)

data class FoodDiversityResult(
    val weeklyEntries: List<WeeklyDiversityEntry>,
    val avgUniquePerWeek: Double,
    val trend: String,
    val confidence: ConfidenceLevel,
    val sampleSize: Int,
)

data class FoodEntry(
    val date: String,
    val foodId: String?,
    val recipeId: String?,
    val foodName: String,
)

private fun getWeekStart(dateStr: String): String {
    val d = LocalDate.parse(dateStr)
    val dow = d.dayOfWeek
    val daysToSubtract = (dow.ordinal) % 7
    return d.minus(daysToSubtract, DateTimeUnit.DAY).toString()
}

fun computeFoodDiversity(entries: List<FoodEntry>): FoodDiversityResult {
    val sampleSize = entries.size
    if (sampleSize == 0) {
        return FoodDiversityResult(
            weeklyEntries = emptyList(),
            avgUniquePerWeek = 0.0,
            trend = "stable",
            confidence = ConfidenceLevel.INSUFFICIENT,
            sampleSize = 0,
        )
    }
    val byWeek = mutableMapOf<String, MutableSet<String>>()
    for (entry in entries) {
        val weekStart = getWeekStart(entry.date)
        val key = entry.foodId ?: entry.recipeId ?: entry.foodName
        byWeek.getOrPut(weekStart) { mutableSetOf() }.add(key)
    }
    val weeklyEntries =
        byWeek.entries
            .sortedBy { it.key }
            .map { (weekStart, foods) -> WeeklyDiversityEntry(weekStart = weekStart, uniqueFoods = foods.size) }

    val avgUniquePerWeek =
        if (weeklyEntries.isNotEmpty()) {
            weeklyEntries.sumOf { it.uniqueFoods.toDouble() } / weeklyEntries.size
        } else {
            0.0
        }

    val trend =
        if (weeklyEntries.size >= 4) {
            val last2Avg = weeklyEntries.takeLast(2).sumOf { it.uniqueFoods.toDouble() } / 2.0
            val prev2Avg = weeklyEntries.dropLast(2).takeLast(2).sumOf { it.uniqueFoods.toDouble() } / 2.0
            when {
                prev2Avg > 0 && (last2Avg - prev2Avg) / prev2Avg > 0.1 -> "increasing"
                prev2Avg > 0 && (prev2Avg - last2Avg) / prev2Avg > 0.1 -> "decreasing"
                else -> "stable"
            }
        } else {
            "stable"
        }

    return FoodDiversityResult(
        weeklyEntries = weeklyEntries,
        avgUniquePerWeek = avgUniquePerWeek,
        trend = trend,
        confidence = getConfidenceLevel(weeklyEntries.size),
        sampleSize = sampleSize,
    )
}
