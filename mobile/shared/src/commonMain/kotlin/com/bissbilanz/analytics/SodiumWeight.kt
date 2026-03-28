package com.bissbilanz.analytics

data class SodiumCorrelation(
    val r: Double,
    val pValue: Double?,
    val sampleSize: Int,
)

data class SodiumWeightResult(
    val correlation: SodiumCorrelation,
    val avgSodium: Double,
    val highSodiumDays: Int,
    val avgWeightDeltaAfterHighSodium: Double?,
    val confidence: ConfidenceLevel,
    val sampleSize: Int,
)

fun computeSodiumWeightCorrelation(
    dailyNutrients: List<Pair<String, Double>>,
    weightSeries: List<Pair<String, Double?>>,
): SodiumWeightResult {
    val weightMap = mutableMapOf<String, Double>()
    for ((date, weightKg) in weightSeries) {
        if (weightKg != null) weightMap[date] = weightKg
    }
    val sodiumValues = mutableListOf<Double>()
    val weightDeltas = mutableListOf<Double>()
    var highSodiumDays = 0
    val highSodiumDeltas = mutableListOf<Double>()
    for ((date, sodium) in dailyNutrients) {
        val nextDate = shiftDate(date, 1)
        val w0 = weightMap[date]
        val w1 = weightMap[nextDate]
        if (w0 == null || w1 == null) continue
        val delta = w1 - w0
        sodiumValues.add(sodium)
        weightDeltas.add(delta)
        if (sodium > 2300) {
            highSodiumDays++
            highSodiumDeltas.add(delta)
        }
    }
    val avgSodium = if (dailyNutrients.isNotEmpty()) dailyNutrients.sumOf { it.second } / dailyNutrients.size else 0.0
    val sampleSize = sodiumValues.size
    val confidence = getConfidenceLevel(sampleSize)
    if (sampleSize < 7) {
        return SodiumWeightResult(
            correlation = SodiumCorrelation(r = 0.0, pValue = null, sampleSize = sampleSize),
            avgSodium = avgSodium,
            highSodiumDays = highSodiumDays,
            avgWeightDeltaAfterHighSodium = null,
            confidence = ConfidenceLevel.INSUFFICIENT,
            sampleSize = sampleSize,
        )
    }
    val result = pearsonCorrelation(sodiumValues.toDoubleArray(), weightDeltas.toDoubleArray())
    val avgWeightDeltaAfterHighSodium = if (highSodiumDeltas.isNotEmpty()) highSodiumDeltas.sum() / highSodiumDeltas.size else null
    return SodiumWeightResult(
        correlation = SodiumCorrelation(r = result.r, pValue = result.pValue, sampleSize = sampleSize),
        avgSodium = avgSodium,
        highSodiumDays = highSodiumDays,
        avgWeightDeltaAfterHighSodium = avgWeightDeltaAfterHighSodium,
        confidence = confidence,
        sampleSize = sampleSize,
    )
}
