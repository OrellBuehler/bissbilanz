package com.bissbilanz.analytics

data class FoodSleepImpact(
    val foodName: String,
    val foodId: String,
    val avgQualityWith: Double,
    val avgQualityWithout: Double,
    val delta: Double,
    val occurrences: Int,
)

data class FoodSleepResult(
    val foodImpacts: List<FoodSleepImpact>,
    val overallAvgQuality: Double,
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

fun detectFoodSleepPatterns(
    eveningFoods: List<EveningFoodEntry>,
    sleepData: List<SleepQualityPoint>,
    minOccurrences: Int = 3,
): FoodSleepResult {
    if (sleepData.isEmpty()) return FoodSleepResult(foodImpacts = emptyList(), overallAvgQuality = 0.0)

    val sleepMap = mutableMapOf<String, Double>()
    for (entry in sleepData) sleepMap[entry.date] = entry.quality

    val overallAvgQuality = sleepData.sumOf { it.quality } / sleepData.size

    val foodsByIdName = mutableMapOf<String, Pair<String, MutableSet<String>>>()
    for (food in eveningFoods) {
        if (!sleepMap.containsKey(food.date)) continue
        val existing = foodsByIdName.getOrPut(food.foodId) { Pair(food.foodName, mutableSetOf()) }
        existing.second.add(food.date)
    }

    val foodImpacts = mutableListOf<FoodSleepImpact>()
    for ((foodId, pair) in foodsByIdName) {
        val (name, dates) = pair
        if (dates.size < minOccurrences) continue
        val withQuality = mutableListOf<Double>()
        val withoutQuality = mutableListOf<Double>()
        for ((date, quality) in sleepMap) {
            if (dates.contains(date)) withQuality.add(quality) else withoutQuality.add(quality)
        }
        if (withQuality.isEmpty()) continue
        val avgQualityWith = withQuality.sum() / withQuality.size
        val avgQualityWithout = if (withoutQuality.isNotEmpty()) withoutQuality.sum() / withoutQuality.size else overallAvgQuality
        val delta = avgQualityWith - avgQualityWithout
        foodImpacts.add(
            FoodSleepImpact(
                foodName = name,
                foodId = foodId,
                avgQualityWith = avgQualityWith,
                avgQualityWithout = avgQualityWithout,
                delta = delta,
                occurrences = dates.size,
            )
        )
    }

    foodImpacts.sortByDescending { kotlin.math.abs(it.delta) }

    return FoodSleepResult(foodImpacts = foodImpacts, overallAvgQuality = overallAvgQuality)
}
