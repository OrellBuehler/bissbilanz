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

private val DII_COEFFICIENTS =
    mapOf(
        "fiber" to -0.663,
        "omega3" to -0.436,
        "vitaminC" to -0.299,
        "vitaminD" to -0.446,
        "vitaminE" to -0.419,
        "saturatedFat" to 0.373,
        "transFat" to 0.229,
        "alcohol" to 0.407,
        "caffeine" to -0.11,
        "sodium" to 0.269,
    )

private val DII_GLOBAL_MEAN =
    mapOf(
        "fiber" to 18.8,
        "omega3" to 1.3,
        "vitaminC" to 108.0,
        "vitaminD" to 6.0,
        "vitaminE" to 8.7,
        "saturatedFat" to 28.6,
        "transFat" to 3.15,
        "alcohol" to 13.98,
        "caffeine" to 220.0,
        "sodium" to 3446.0,
    )

private val DII_GLOBAL_SD =
    mapOf(
        "fiber" to 8.0,
        "omega3" to 1.0,
        "vitaminC" to 85.0,
        "vitaminD" to 5.0,
        "vitaminE" to 5.0,
        "saturatedFat" to 12.0,
        "transFat" to 2.0,
        "alcohol" to 20.0,
        "caffeine" to 150.0,
        "sodium" to 1200.0,
    )

private val ZERO_VALID_NUTRIENTS = setOf("alcohol", "transFat", "caffeine")

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
            ratio <= 4.0 -> "optimal"
            ratio <= 10.0 -> "elevated"
            ratio <= 20.0 -> "high"
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
    val tefValues =
        dailyNutrients.map { d ->
            d.protein * 4.0 * 0.25 + d.carbs * 4.0 * 0.08 + d.fat * 9.0 * 0.03
        }
    val avgTEF = tefValues.sum() / sampleSize
    val avgCalories = dailyNutrients.sumOf { it.calories } / sampleSize
    val avgTEFPct = if (avgCalories > 0) (avgTEF / avgCalories) * 100.0 else 0.0
    return TEFResult(
        avgTEF = avgTEF,
        avgTEFPct = avgTEFPct,
        confidence = getConfidenceLevel(sampleSize),
        sampleSize = sampleSize,
    )
}
