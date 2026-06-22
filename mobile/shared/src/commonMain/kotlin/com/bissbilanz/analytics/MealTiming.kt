package com.bissbilanz.analytics

import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

data class DailyEatingWindow(
    val date: String,
    val firstMealTime: String,
    val lastMealTime: String,
    val windowMinutes: Int,
    val mealCount: Int,
    val lateNightMeals: Int,
)

data class MealTimingSummary(
    val dailyWindows: List<DailyEatingWindow>,
    val avgWindowMinutes: Double,
    val avgFirstMealTime: String,
    val avgLastMealTime: String,
    val lateNightFrequency: Double,
    val hourlyDistribution: List<Int>,
)

data class MealEntry(
    val date: String,
    val eatenAt: String?,
    val calories: Double,
)

fun extractMealTimingPatterns(
    entries: List<MealEntry>,
    timeZone: String,
): MealTimingSummary {
    val hourlyDistribution = MutableList(24) { 0 }
    val byDate = mutableMapOf<String, MutableList<Pair<Int, Int>>>()

    for (entry in entries) {
        if (entry.eatenAt == null) continue
        val localMinutes = localMinutesOfDay(entry.eatenAt, timeZone) ?: continue
        val hour = localMinutes / 60
        hourlyDistribution[hour]++
        byDate.getOrPut(entry.date) { mutableListOf() }.add(Pair(localMinutes, hour))
    }

    val dailyWindows = mutableListOf<DailyEatingWindow>()
    for ((date, meals) in byDate) {
        val minutes = meals.map { it.first }
        val first = minutes.min()
        val last = minutes.max()
        val lateNightMeals = meals.count { it.second >= 21 }
        dailyWindows.add(
            DailyEatingWindow(
                date = date,
                firstMealTime = minutesToHHmm(first),
                lastMealTime = minutesToHHmm(last),
                windowMinutes = last - first,
                mealCount = meals.size,
                lateNightMeals = lateNightMeals,
            ),
        )
    }

    dailyWindows.sortBy { it.date }

    if (dailyWindows.isEmpty()) {
        return MealTimingSummary(
            dailyWindows = emptyList(),
            avgWindowMinutes = 0.0,
            avgFirstMealTime = "00:00",
            avgLastMealTime = "00:00",
            lateNightFrequency = 0.0,
            hourlyDistribution = hourlyDistribution,
        )
    }

    val avgWindowMinutes = dailyWindows.sumOf { it.windowMinutes.toDouble() } / dailyWindows.size
    val avgFirstMinutes = dailyWindows.sumOf { hhmmToMinutes(it.firstMealTime).toDouble() } / dailyWindows.size
    val avgLastMinutes = dailyWindows.sumOf { hhmmToMinutes(it.lastMealTime).toDouble() } / dailyWindows.size
    val daysWithLateNight = dailyWindows.count { it.lateNightMeals > 0 }
    val lateNightFrequency = (daysWithLateNight.toDouble() / dailyWindows.size) * 100.0

    return MealTimingSummary(
        dailyWindows = dailyWindows,
        avgWindowMinutes = avgWindowMinutes,
        avgFirstMealTime = minutesToHHmm(avgFirstMinutes.roundToInt()),
        avgLastMealTime = minutesToHHmm(avgLastMinutes.roundToInt()),
        lateNightFrequency = lateNightFrequency,
        hourlyDistribution = hourlyDistribution,
    )
}

internal fun minutesToHHmm(totalMinutes: Int): String {
    val h = (totalMinutes / 60) % 24
    val m = totalMinutes % 60
    return "${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}"
}

internal fun hhmmToMinutes(hhmm: String): Int {
    val parts = hhmm.split(":")
    return parts[0].toInt() * 60 + parts[1].toInt()
}
