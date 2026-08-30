package com.bissbilanz.analytics

import kotlin.math.abs

data class NOVAResult(
    /** Share of *all* logged calories from NOVA group 4. */
    val ultraProcessedPct: Double,
    /** Share of all logged calories with no NOVA group — reported, not excluded. */
    val unknownPct: Double,
    val coveragePct: Double,
    val groupDistribution: Map<Int, Double>,
    val totalKcal: Double,
    val confidence: ConfidenceLevel,
    val sampleSize: Int,
)

/** One day's omega intake with the calorie-weighted share of food that carried omega values. */
data class OmegaDay(
    val date: String,
    val omega3: Double,
    val omega6: Double,
    val coverage: Double = 1.0,
)

data class OmegaResult(
    /** Null when there is no day with both omegas logged — there is no ratio to show. */
    val ratio: Double?,
    val avgOmega3: Double,
    val avgOmega6: Double,
    /**
     * "optimal" (at or under the IOM adequate-intake proportions, ≈ 10.6:1),
     * "elevated", "high" or "insufficient". No band carries a clinical "critical"
     * register any more.
     */
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
    /** Per-nutrient calorie-weighted coverage of the day (1 when absent). */
    val coverage: Map<String, Double> = emptyMap(),
)

data class DIIContributor(
    val nutrient: String,
    val impact: Double,
)

data class DIIResult(
    val score: Double,
    val classification: String,
    val contributors: List<DIIContributor>,
    /** Share of the full 45-parameter index's weight that the scored nutrients carry. */
    val coverageFraction: Double,
    /** |score| below this is neutral — the published ±1 cut-point scaled by coverageFraction. */
    val neutralBand: Double,
    val confidence: ConfidenceLevel,
    val sampleSize: Int,
)

data class TEFResult(
    val avgTEF: Double,
    val avgTEFPct: Double,
    val confidence: ConfidenceLevel,
    val sampleSize: Int,
)

/**
 * NOVA groups come from Open Food Facts, which covers barcoded packaged products —
 * disproportionately group 4 — so every share here is over *total* calories, with
 * the untagged remainder shown as unknown rather than dropped from the denominator.
 */
fun computeNOVAScore(entries: List<Pair<Double, Int?>>): NOVAResult {
    val sampleSize = entries.size
    if (sampleSize == 0) {
        return NOVAResult(
            ultraProcessedPct = 0.0,
            unknownPct = 0.0,
            coveragePct = 0.0,
            groupDistribution = emptyMap(),
            totalKcal = 0.0,
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
    val coveragePct = if (totalKcal > 0) (novaKcal / totalKcal) * 100.0 else 0.0
    val ultraProcessedPct = if (totalKcal > 0) (group4Kcal / totalKcal) * 100.0 else 0.0
    val unknownPct = if (totalKcal > 0) 100.0 - coveragePct else 0.0
    val baseConfidence = getConfidenceLevel(sampleSize)
    val confidence =
        if (coveragePct < 30.0 && baseConfidence != ConfidenceLevel.INSUFFICIENT) {
            ConfidenceLevel.LOW
        } else {
            baseConfidence
        }
    return NOVAResult(
        ultraProcessedPct = ultraProcessedPct,
        unknownPct = unknownPct,
        coveragePct = coveragePct,
        groupDistribution = groupKcal,
        totalKcal = totalKcal,
        confidence = confidence,
        sampleSize = sampleSize,
    )
}

fun computeOmegaRatio(
    dailyNutrients: List<OmegaDay>,
    minCoverage: Double = MIN_NUTRIENT_COVERAGE,
): OmegaResult {
    val filtered = dailyNutrients.filter { it.omega3 > 0 && it.omega6 > 0 && it.coverage >= minCoverage }
    val sampleSize = filtered.size
    if (sampleSize == 0) {
        return OmegaResult(
            ratio = null,
            avgOmega3 = 0.0,
            avgOmega6 = 0.0,
            status = "insufficient",
            confidence = ConfidenceLevel.INSUFFICIENT,
            sampleSize = 0,
        )
    }
    val avgOmega3 = filtered.sumOf { it.omega3 } / sampleSize
    val avgOmega6 = filtered.sumOf { it.omega6 } / sampleSize
    val ratio = if (avgOmega3 > 0) avgOmega6 / avgOmega3 else null
    val status =
        when {
            ratio == null || ratio <= OMEGA_RATIO_OPTIMAL_MAX -> "optimal"
            ratio <= OMEGA_RATIO_ELEVATED_MAX -> "elevated"
            else -> "high"
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

/**
 * Dietary Inflammatory Index over the parameters this app tracks, following
 * Shivappa et al. 2014: z-score against the global mean/SD → percentile →
 * centred to [−1, +1] → × the parameter's inflammatory effect score, so no
 * single implausible entry can move the score without bound. Only 9 of the 45
 * published parameters are measured, so the ±1 classification cut-points are
 * scaled by the share of the index's total weight those 9 carry. Caffeine is
 * tabulated in g in the source; intakes arrive in mg.
 */
fun computeDIIScore(
    dailyNutrients: List<DIIInput>,
    minCoverage: Double = MIN_NUTRIENT_COVERAGE,
): DIIResult {
    val sampleSize = dailyNutrients.size
    if (sampleSize == 0) {
        return DIIResult(
            score = 0.0,
            classification = "neutral",
            contributors = emptyList(),
            coverageFraction = 0.0,
            neutralBand = 0.0,
            confidence = ConfidenceLevel.INSUFFICIENT,
            sampleSize = 0,
        )
    }

    fun valueOf(
        day: DIIInput,
        nutrient: String,
    ): Double? =
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
            else -> null
        }

    var totalScore = 0.0
    var absCoefUsed = 0.0
    val contributors = mutableListOf<DIIContributor>()

    for (nutrient in DII_COEFFICIENTS.keys) {
        val zeroValid = nutrient in ZERO_VALID_NUTRIENTS
        val values =
            dailyNutrients
                .filter { (it.coverage[nutrient] ?: 1.0) >= minCoverage }
                .mapNotNull { day ->
                    val v = valueOf(day, nutrient) ?: return@mapNotNull null
                    if (!zeroValid && v <= 0.0) null else v
                }
        if (values.size.toDouble() / sampleSize < 0.5) continue
        var mean = values.sum() / values.size
        if (nutrient == "caffeine") mean /= DII_CAFFEINE_MG_PER_TABLE_UNIT
        val globalMean = DII_GLOBAL_MEAN[nutrient] ?: continue
        val globalSd = DII_GLOBAL_SD[nutrient] ?: continue
        val coefficient = DII_COEFFICIENTS[nutrient] ?: continue
        val z = (mean - globalMean) / globalSd
        val centredPercentile = 2 * normalCdf(z) - 1
        val impact = centredPercentile * coefficient
        totalScore += impact
        absCoefUsed += abs(coefficient)
        contributors.add(DIIContributor(nutrient = nutrient, impact = impact))
    }

    contributors.sortByDescending { abs(it.impact) }

    val coverageFraction = absCoefUsed / DII_FULL_INDEX_ABS_COEF_SUM
    val neutralBand = DII_NEUTRAL_CUTPOINT * coverageFraction
    val classification =
        when {
            totalScore < -neutralBand -> "anti-inflammatory"
            totalScore <= neutralBand -> "neutral"
            else -> "pro-inflammatory"
        }

    return DIIResult(
        score = totalScore,
        classification = classification,
        contributors = contributors,
        coverageFraction = coverageFraction,
        neutralBand = neutralBand,
        confidence = getConfidenceLevel(sampleSize),
        sampleSize = sampleSize,
    )
}

data class TEFInput(
    val protein: Double,
    val carbs: Double,
    val fat: Double,
    val calories: Double,
    val alcohol: Double? = null,
)

/** Diet-induced thermogenesis of alcohol, mid-range of the 10–30% literature spread. */
private const val ALCOHOL_TEF_FRACTION = 0.2

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
        val tef =
            d.protein * 4.0 * 0.25 + d.carbs * 4.0 * 0.08 + d.fat * 9.0 * 0.03 +
                (d.alcohol ?: 0.0) * 7.0 * ALCOHOL_TEF_FRACTION
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
