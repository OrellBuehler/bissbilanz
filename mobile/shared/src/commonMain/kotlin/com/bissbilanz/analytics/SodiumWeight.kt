package com.bissbilanz.analytics

/** The 2019 IOM Chronic Disease Risk Reduction intake — a policy figure, used only to label days. */
const val SODIUM_CDRR_MG: Double = 2300.0

data class SodiumCorrelation(
    val r: Double,
    val pValue: Double?,
    val ciLow: Double?,
    val ciHigh: Double?,
    val sampleSize: Int,
)

data class SodiumWeightResult(
    val correlation: SodiumCorrelation,
    /** Mean sodium over the days that had a next-day weight pair — the same days the correlation used. */
    val avgSodium: Double,
    val highSodiumDays: Int,
    val avgWeightDeltaAfterHighSodium: Double?,
    val confidence: ConfidenceLevel,
    val sampleSize: Int,
)

/** One day's sodium with the calorie-weighted share of food that carried a sodium value. */
data class SodiumDay(
    val date: String,
    val sodium: Double,
    val coverage: Double = 1.0,
)

fun computeSodiumWeightCorrelation(
    dailyNutrients: List<SodiumDay>,
    weightSeries: List<Pair<String, Double?>>,
    minCoverage: Double = MIN_NUTRIENT_COVERAGE,
): SodiumWeightResult {
    val weightMap = mutableMapOf<String, Double>()
    for ((date, weightKg) in weightSeries) {
        if (weightKg != null) weightMap[date] = weightKg
    }
    val sodiumValues = mutableListOf<Double>()
    val weightDeltas = mutableListOf<Double>()
    var highSodiumDays = 0
    val highSodiumDeltas = mutableListOf<Double>()
    for (entry in dailyNutrients) {
        if (entry.coverage < minCoverage) continue
        val nextDate = shiftDate(entry.date, 1)
        val w0 = weightMap[entry.date] ?: continue
        val w1 = weightMap[nextDate] ?: continue
        val delta = w1 - w0
        sodiumValues.add(entry.sodium)
        weightDeltas.add(delta)
        if (entry.sodium > SODIUM_CDRR_MG) {
            highSodiumDays++
            highSodiumDeltas.add(delta)
        }
    }
    val sampleSize = sodiumValues.size
    val avgSodium = if (sampleSize > 0) sodiumValues.sum() / sampleSize else 0.0
    val confidence = getConfidenceLevel(sampleSize)
    if (sampleSize < 7) {
        return SodiumWeightResult(
            correlation = SodiumCorrelation(r = 0.0, pValue = null, ciLow = null, ciHigh = null, sampleSize = sampleSize),
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
        correlation =
            SodiumCorrelation(
                r = result.r,
                pValue = result.pValue,
                ciLow = result.ciLow,
                ciHigh = result.ciHigh,
                sampleSize = sampleSize,
            ),
        avgSodium = avgSodium,
        highSodiumDays = highSodiumDays,
        avgWeightDeltaAfterHighSodium = avgWeightDeltaAfterHighSodium,
        confidence = confidence,
        sampleSize = sampleSize,
    )
}
