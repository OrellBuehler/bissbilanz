package com.bissbilanz.analytics

data class LagResult(
    val lag: Int,
    val correlation: CorrelationResult?,
)

data class CaloricLagResult(
    val bestLag: Int?,
    val results: List<LagResult>,
)

fun computeCaloricLag(
    dailyCalories: List<Pair<String, Double?>>,
    dailyWeight: List<Pair<String, Double?>>,
    maxLag: Int = 7,
): CaloricLagResult {
    val calorieMap = mutableMapOf<String, Double>()
    for ((date, value) in dailyCalories) {
        if (value != null) calorieMap[date] = value
    }
    val weightMap = mutableMapOf<String, Double>()
    for ((date, value) in dailyWeight) {
        if (value != null) weightMap[date] = value
    }
    val results = mutableListOf<LagResult>()
    for (lag in 1..maxLag) {
        val pairedCalories = mutableListOf<Double>()
        val pairedWeights = mutableListOf<Double>()
        for ((date, weight) in weightMap) {
            val shiftedDate = shiftDate(date, -lag)
            val calories = calorieMap[shiftedDate]
            if (calories != null) {
                pairedCalories.add(calories)
                pairedWeights.add(weight)
            }
        }
        if (pairedCalories.size < 7) {
            results.add(LagResult(lag = lag, correlation = null))
        } else {
            results.add(
                LagResult(
                    lag = lag,
                    correlation = pearsonCorrelation(pairedCalories.toDoubleArray(), pairedWeights.toDoubleArray()),
                ),
            )
        }
    }
    var bestLag: Int? = null
    var bestAbsR = -1.0
    for (result in results) {
        if (result.correlation != null) {
            val absR = kotlin.math.abs(result.correlation.r)
            if (absR > bestAbsR) {
                bestAbsR = absR
                bestLag = result.lag
            }
        }
    }
    return CaloricLagResult(bestLag = bestLag, results = results)
}
