package com.bissbilanz.analytics

import kotlin.math.roundToInt

data class DailyEatingWindow(
    /** The eating day (04:00–03:59 local) the meals were assigned to. */
    val date: String,
    val firstMealTime: String,
    val lastMealTime: String,
    val windowMinutes: Int,
    val mealCount: Int,
    /** Meals at or after 21:00, including post-midnight ones before 04:00. */
    val lateNightMeals: Int,
)

data class MealTimingSummary(
    val dailyWindows: List<DailyEatingWindow>,
    val avgWindowMinutes: Double,
    /** Circular mean of the first-meal clock time. */
    val avgFirstMealTime: String,
    /** Circular mean of the last-meal clock time. */
    val avgLastMealTime: String,
    val lateNightFrequency: Double,
    val hourlyDistribution: List<Int>,
)

data class MealEntry(
    val date: String,
    val eatenAt: String?,
    val calories: Double,
)

private const val MINUTES_PER_DAY = 1440
private const val LATE_NIGHT_FROM_MINUTES = 21 * 60

/**
 * Daily eating windows. Meals are grouped by *eating day* — a rolling day
 * starting at 04:00 local — rather than by the calendar date, so a 00:30 snack
 * extends the previous evening's window instead of becoming the next day's
 * "first meal". Within a day the arithmetic runs on minutes since the 04:00
 * boundary, which cannot wrap.
 */
fun extractMealTimingPatterns(
    entries: List<MealEntry>,
    timeZone: String,
): MealTimingSummary {
    val hourlyDistribution = MutableList(24) { 0 }
    val byDate = mutableMapOf<String, MutableList<Pair<Int, Int>>>()

    for (entry in entries) {
        if (entry.eatenAt == null) continue
        val point = eatingDayOf(entry.eatenAt, timeZone) ?: continue
        hourlyDistribution[point.clockMinutes / 60]++
        byDate.getOrPut(point.date) { mutableListOf() }.add(Pair(point.minutes, point.clockMinutes))
    }

    val dailyWindows = mutableListOf<DailyEatingWindow>()
    val firstClockMinutes = mutableListOf<Double>()
    val lastClockMinutes = mutableListOf<Double>()
    for ((date, meals) in byDate) {
        val minutes = meals.map { it.first }
        val first = minutes.min()
        val last = minutes.max()
        val lateNightMeals = meals.count { it.first >= LATE_NIGHT_FROM_MINUTES - EATING_DAY_BOUNDARY_MINUTES }
        val firstClock = toClock(first)
        val lastClock = toClock(last)
        firstClockMinutes.add(firstClock.toDouble())
        lastClockMinutes.add(lastClock.toDouble())
        dailyWindows.add(
            DailyEatingWindow(
                date = date,
                firstMealTime = minutesToHHmm(firstClock),
                lastMealTime = minutesToHHmm(lastClock),
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
    val avgFirstMinutes = circularMeanMinutes(firstClockMinutes) ?: 0.0
    val avgLastMinutes = circularMeanMinutes(lastClockMinutes) ?: 0.0
    val daysWithLateNight = dailyWindows.count { it.lateNightMeals > 0 }
    val lateNightFrequency = (daysWithLateNight.toDouble() / dailyWindows.size) * 100.0

    return MealTimingSummary(
        dailyWindows = dailyWindows,
        avgWindowMinutes = avgWindowMinutes,
        avgFirstMealTime = minutesToHHmm(jsRoundToInt(avgFirstMinutes) % MINUTES_PER_DAY),
        avgLastMealTime = minutesToHHmm(jsRoundToInt(avgLastMinutes) % MINUTES_PER_DAY),
        lateNightFrequency = lateNightFrequency,
        hourlyDistribution = hourlyDistribution,
    )
}

/** JS `Math.round` (half toward +infinity) so the two platforms print the same HH:mm. */
private fun jsRoundToInt(value: Double): Int = kotlin.math.floor(value + 0.5).toInt()

/** Minutes since the eating-day boundary → minutes since real midnight. */
private fun toClock(minutesSinceBoundary: Int): Int = (minutesSinceBoundary + EATING_DAY_BOUNDARY_MINUTES) % MINUTES_PER_DAY

internal fun minutesToHHmm(totalMinutes: Int): String {
    val h = (totalMinutes / 60) % 24
    val m = totalMinutes % 60
    return "${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}"
}

internal fun hhmmToMinutes(hhmm: String): Int {
    val parts = hhmm.split(":")
    return parts[0].toInt() * 60 + parts[1].toInt()
}

@Suppress("unused")
private fun Double.roundedToInt(): Int = roundToInt()
