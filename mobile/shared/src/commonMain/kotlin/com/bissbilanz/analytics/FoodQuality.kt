package com.bissbilanz.analytics

import kotlin.math.abs

data class NOVAResult(
    val ultraProcessedPct: Double,
    val coveragePct: Double,
    val groupDistribution: Map<Int, Double>,
    val confidence: ConfidenceLevel,
    val sampleSize: Int,
)

data class OmegaResult(
    val ratio: Double,
    val avgOmega3: Double,
    val avgOmega6: Double,
    val status: String,
    val confidence: ConfidenceLevel,
    val sampleSize: Int,
)

data class DIIInput(
    val fiber: Double? = null,
    val omega3: Double? = null,
    val vitaminC: Double? = null,
    val vitaminD: Double? = null,
    val vitaminE: Double? = null,
    val saturatedFat: Double? = null,
    val transFat: Double? = null,
    val alcohol: Double? = null,
    val caffeine: Double? = null,
    val sodium: Double? = null,
)

data class DIIContributor(
    val nutrient: String,
    val impact: Double,
)

data class DIIResult(
    val score: Double,
    val classification: String,
    val contributors: List<DIIContributor>,
    val confidence: ConfidenceLevel,
    val sampleSize: Int,
)

data class TEFResult(
    val avgTEF: Double,
    val avgTEFPct: Double,
    val confidence: ConfidenceLevel,
    val sampleSize: Int,
)

fun computeNOVAScore(entries: List<Pair<Double, Int?>>): NOVAResult {
    val sampleSize = entries.size
    if (sampleSize == 0) {
        return NOVAResult(
            ultraProcessedPct = 0.0,
            coveragePct = 0.0,
            groupDistribution = emptyMap(),
            confidence = ConfidenceLevel.INSUFFICIENT,
            sampleSize = 0,
        )
    }
    val totalKcal = entries.sumOf { it.first }
    val groupKcal = mutableMapOf<Int, Double>()
    for ((calories, novaGroup) in entries) {
        if (novaGroup != null) {
            groupKcal[novaGroup] = (groupKcal[novaGroup] ?: 0.0) + calories
        }
    }
    val novaKcal = groupKcal.values.sum()
    val group4Kcal = groupKcal[4] ?: 0.0
    val ultraProcessedPct = if (novaKcal > 0) (group4Kcal / novaKcal) * 100.0 else 0.0
    val coveragePct = if (totalKcal > 0) (novaKcal / totalKcal) * 100.0 else 0.0
    val baseConfidence = getConfidenceLevel(sampleSize)
    val confidence =
        if (coveragePct < 30.0 && baseConfidence != ConfidenceLevel.INSUFFICIENT) {
            ConfidenceLevel.LOW
        } else {
            baseConfidence
        }
    return NOVAResult(
        ultraProcessedPct = ultraProcessedPct,
        coveragePct = coveragePct,
        groupDistribution = groupKcal,
        confidence = confidence,
        sampleSize = sampleSize,
    )
}

fun computeOmegaRatio(dailyNutrients: List<Triple<String, Double, Double>>): OmegaResult {
    val filtered = dailyNutrients.filter { it.second > 0 && it.third > 0 }
    val sampleSize = filtered.size
    if (sampleSize == 0) {
        return OmegaResult(
            ratio = 0.0,
            avgOmega3 = 0.0,
            avgOmega6 = 0.0,
            status = "insufficient",
            confidence = ConfidenceLevel.INSUFFICIENT,
            sampleSize = 0,
        )
    }
    val avgOmega3 = filtered.sumOf { it.second } / sampleSize
    val avgOmega6 = filtered.sumOf { it.third } / sampleSize
    val ratio = if (avgOmega3 > 0) avgOmega6 / avgOmega3 else 0.0
    val status =
        when {
            ratio <= OMEGA_RATIO_OPTIMAL_MAX -> "optimal"
            ratio <= OMEGA_RATIO_ELEVATED_MAX -> "elevated"
            ratio <= OMEGA_RATIO_HIGH_MAX -> "high"
            else -> "critical"
        }
    return OmegaResult(
        ratio = ratio,
        avgOmega3 = avgOmega3,
        avgOmega6 = avgOmega6,
        status = status,
        confidence = getConfidenceLevel(sampleSize),
        sampleSize = sampleSize,
    )
}

fun computeDIIScore(dailyNutrients: List<DIIInput>): DIIResult {
    val sampleSize = dailyNutrients.size
    if (sampleSize == 0) {
        return DIIResult(
            score = 0.0,
            classification = "neutral",
            contributors = emptyList(),
            confidence = ConfidenceLevel.INSUFFICIENT,
            sampleSize = 0,
        )
    }

    fun getValues(nutrient: String): List<Double> {
        val zeroValid = nutrient in ZERO_VALID_NUTRIENTS
        return dailyNutrients.mapNotNull { day ->
            val v =
                when (nutrient) {
                    "fiber" -> day.fiber
                    "omega3" -> day.omega3
                    "vitaminC" -> day.vitaminC
                    "vitaminD" -> day.vitaminD
                    "vitaminE" -> day.vitaminE
                    "saturatedFat" -> day.saturatedFat
                    "transFat" -> day.transFat
                    "alcohol" -> day.alcohol
                    "caffeine" -> day.caffeine
                    "sodium" -> day.sodium
                    else -> null
                }
            if (v == null) {
                null
            } else if (!zeroValid && v == 0.0) {
                null
            } else {
                v
            }
        }
    }

    var totalScore = 0.0
    val contributors = mutableListOf<DIIContributor>()

    for (nutrient in DII_COEFFICIENTS.keys) {
        val values = getValues(nutrient)
        val coverage = values.size.toDouble() / sampleSize
        if (coverage < 0.5) continue
        val mean = values.sum() / values.size
        val globalMean = DII_GLOBAL_MEAN[nutrient] ?: continue
        val globalSd = DII_GLOBAL_SD[nutrient] ?: continue
        val coefficient = DII_COEFFICIENTS[nutrient] ?: continue
        if (globalSd == 0.0) continue
        val z = (mean - globalMean) / globalSd
        val impact = z * coefficient
        totalScore += impact
        contributors.add(DIIContributor(nutrient = nutrient, impact = impact))
    }

    contributors.sortByDescending { abs(it.impact) }

    val classification =
        when {
            totalScore < -1.0 -> "anti-inflammatory"
            totalScore <= 1.0 -> "neutral"
            else -> "pro-inflammatory"
        }

    return DIIResult(
        score = totalScore,
        classification = classification,
        contributors = contributors,
        confidence = getConfidenceLevel(sampleSize),
        sampleSize = sampleSize,
    )
}

data class TEFInput(
    val protein: Double,
    val carbs: Double,
    val fat: Double,
    val calories: Double,
)

fun computeTEF(dailyNutrients: List<TEFInput>): TEFResult {
    val sampleSize = dailyNutrients.size
    if (sampleSize == 0) {
        return TEFResult(
            avgTEF = 0.0,
            avgTEFPct = 0.0,
            confidence = ConfidenceLevel.INSUFFICIENT,
            sampleSize = 0,
        )
    }
    // Average-of-ratios (per-day TEF%), matching the server TS computeTEF. A
    // ratio-of-averages (avgTEF / avgCalories) diverges whenever daily calories
    // vary, which broke cross-platform parity.
    var totalTEF = 0.0
    var totalTEFPct = 0.0
    for (d in dailyNutrients) {
        val tef = d.protein * 4.0 * 0.25 + d.carbs * 4.0 * 0.08 + d.fat * 9.0 * 0.03
        totalTEF += tef
        totalTEFPct += if (d.calories > 0) (tef / d.calories) * 100.0 else 0.0
    }
    return TEFResult(
        avgTEF = totalTEF / sampleSize,
        avgTEFPct = totalTEFPct / sampleSize,
        confidence = getConfidenceLevel(sampleSize),
        sampleSize = sampleSize,
    )
}
