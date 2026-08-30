package com.bissbilanz.analytics

/**
 * One nutrient's dietary reference intakes (IOM, adults 19–50).
 *
 * [rdaMale]/[rdaFemale] hold the RDA, or the AI / CDRR where no RDA exists — see
 * [referenceType]. [earMale]/[earFemale] are the Estimated Average Requirements
 * where one is defined (null for AI-only nutrients and sodium). [per1000Kcal] is
 * set for energy-scaled references (fiber: 14 g per 1000 kcal) and overrides the
 * fixed values. Generated from analytics-parity/constants.json.
 */
data class RdaEntry(
    val nutrientKey: String,
    val unit: String,
    val rdaMale: Double,
    val rdaFemale: Double,
    val label: String,
    val earMale: Double? = null,
    val earFemale: Double? = null,
    val referenceType: String = "rda",
    val per1000Kcal: Double? = null,
)
