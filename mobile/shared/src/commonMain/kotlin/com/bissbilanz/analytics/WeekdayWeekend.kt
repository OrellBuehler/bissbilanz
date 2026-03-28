package com.bissbilanz.analytics

import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.LocalDate

data class DayStats(
    val avgCalories: Double,
    val avgProtein: Double,
    val avgCarbs: Double,
    val avgFat: Double,
    val avgFiber: Double,
    val days: Int,
)

data class WeekdayWeekendResult(
    val weekday: DayStats,
    val weekend: DayStats,
    val calorieDelta: Double,
    val calorieDeltaPct: Double,
    val confidence: ConfidenceLevel,
    val sampleSize: Int,
)

data class DayEntry(
    val date: String,
    val calories: Double,
    val protein: Double,
    val carbs: Double,
    val fat: Double,
    val fiber: Double,
)

private fun emptyStats() =
    DayStats(
        avgCalories = 0.0,
        avgProtein = 0.0,
        avgCarbs = 0.0,
        avgFat = 0.0,
        avgFiber = 0.0,
        days = 0,
    )

private fun computeStats(days: List<DayEntry>): DayStats {
    if (days.isEmpty()) return emptyStats()
    val n = days.size
    return DayStats(
        avgCalories = days.sumOf { it.calories } / n,
        avgProtein = days.sumOf { it.protein } / n,
        avgCarbs = days.sumOf { it.carbs } / n,
        avgFat = days.sumOf { it.fat } / n,
        avgFiber = days.sumOf { it.fiber } / n,
        days = n,
    )
}

fun computeWeekdayWeekendSplit(dailyNutrients: List<DayEntry>): WeekdayWeekendResult {
    val weekdays = mutableListOf<DayEntry>()
    val weekends = mutableListOf<DayEntry>()
    for (day in dailyNutrients) {
        val dow = LocalDate.parse(day.date).dayOfWeek
        if (dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY) {
            weekends.add(day)
        } else {
            weekdays.add(day)
        }
    }
    val weekday = computeStats(weekdays)
    val weekend = computeStats(weekends)
    val calorieDelta = weekend.avgCalories - weekday.avgCalories
    val calorieDeltaPct = if (weekday.avgCalories > 0) (calorieDelta / weekday.avgCalories) * 100.0 else 0.0
    return WeekdayWeekendResult(
        weekday = weekday,
        weekend = weekend,
        calorieDelta = calorieDelta,
        calorieDeltaPct = calorieDeltaPct,
        confidence = getConfidenceLevel(dailyNutrients.size),
        sampleSize = dailyNutrients.size,
    )
}
