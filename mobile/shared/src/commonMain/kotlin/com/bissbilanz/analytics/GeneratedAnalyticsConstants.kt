// GENERATED FILE — DO NOT EDIT.
// Source of truth: analytics-parity/constants.json. Regenerate with `bun run constants:generate`.
package com.bissbilanz.analytics

val RDA_VALUES: List<RdaEntry> =
    listOf(
        RdaEntry("vitaminA", "µg", 900.0, 700.0, "Vitamin A", 625.0, 500.0, "rda", null),
        RdaEntry("vitaminC", "mg", 90.0, 75.0, "Vitamin C", 75.0, 60.0, "rda", null),
        RdaEntry("vitaminD", "µg", 15.0, 15.0, "Vitamin D", 10.0, 10.0, "rda", null),
        RdaEntry("vitaminE", "mg", 15.0, 15.0, "Vitamin E", 12.0, 12.0, "rda", null),
        RdaEntry("vitaminK", "µg", 120.0, 90.0, "Vitamin K", null, null, "ai", null),
        RdaEntry("vitaminB1", "mg", 1.2, 1.1, "Thiamin (B1)", 1.0, 0.9, "rda", null),
        RdaEntry("vitaminB2", "mg", 1.3, 1.1, "Riboflavin (B2)", 1.1, 0.9, "rda", null),
        RdaEntry("vitaminB3", "mg", 16.0, 14.0, "Niacin (B3)", 12.0, 11.0, "rda", null),
        RdaEntry("vitaminB5", "mg", 5.0, 5.0, "Pantothenic Acid (B5)", null, null, "ai", null),
        RdaEntry("vitaminB6", "mg", 1.3, 1.3, "Vitamin B6", 1.1, 1.1, "rda", null),
        RdaEntry("vitaminB7", "µg", 30.0, 30.0, "Biotin (B7)", null, null, "ai", null),
        RdaEntry("vitaminB9", "µg", 400.0, 400.0, "Folate (B9)", 320.0, 320.0, "rda", null),
        RdaEntry("vitaminB12", "µg", 2.4, 2.4, "Vitamin B12", 2.0, 2.0, "rda", null),
        RdaEntry("calcium", "mg", 1000.0, 1000.0, "Calcium", 800.0, 800.0, "rda", null),
        RdaEntry("iron", "mg", 8.0, 18.0, "Iron", 6.0, 8.1, "rda", null),
        RdaEntry("magnesium", "mg", 420.0, 320.0, "Magnesium", 350.0, 265.0, "rda", null),
        RdaEntry("phosphorus", "mg", 700.0, 700.0, "Phosphorus", 580.0, 580.0, "rda", null),
        RdaEntry("potassium", "mg", 3400.0, 2600.0, "Potassium", null, null, "ai", null),
        RdaEntry("sodium", "mg", 2300.0, 2300.0, "Sodium", null, null, "cdrr", null),
        RdaEntry("zinc", "mg", 11.0, 8.0, "Zinc", 9.4, 6.8, "rda", null),
        RdaEntry("copper", "mg", 0.9, 0.9, "Copper", 0.7, 0.7, "rda", null),
        RdaEntry("manganese", "mg", 2.3, 1.8, "Manganese", null, null, "ai", null),
        RdaEntry("selenium", "µg", 55.0, 55.0, "Selenium", 45.0, 45.0, "rda", null),
        RdaEntry("iodine", "µg", 150.0, 150.0, "Iodine", 95.0, 95.0, "rda", null),
        RdaEntry("chromium", "µg", 35.0, 25.0, "Chromium", null, null, "ai", null),
        RdaEntry("molybdenum", "µg", 45.0, 45.0, "Molybdenum", 34.0, 34.0, "rda", null),
        RdaEntry("fluoride", "mg", 4.0, 3.0, "Fluoride", null, null, "ai", null),
        RdaEntry("chloride", "mg", 2300.0, 2300.0, "Chloride", null, null, "ai", null),
        RdaEntry("omega3", "g", 1.6, 1.1, "Omega-3", null, null, "ai", null),
        RdaEntry("omega6", "g", 17.0, 12.0, "Omega-6", null, null, "ai", null),
        RdaEntry("fiber", "g", 38.0, 25.0, "Fiber", null, null, "ai", 14.0),
    )

val DII_COEFFICIENTS: Map<String, Double> =
    mapOf(
        "fiber" to -0.663,
        "omega3" to -0.436,
        "vitaminC" to -0.424,
        "vitaminD" to -0.446,
        "vitaminE" to -0.419,
        "saturatedFat" to 0.373,
        "transFat" to 0.229,
        "alcohol" to -0.278,
        "caffeine" to -0.11,
    )

val DII_GLOBAL_MEAN: Map<String, Double> =
    mapOf(
        "fiber" to 18.8,
        "omega3" to 1.06,
        "vitaminC" to 118.2,
        "vitaminD" to 6.26,
        "vitaminE" to 8.73,
        "saturatedFat" to 28.6,
        "transFat" to 3.15,
        "alcohol" to 13.98,
        "caffeine" to 8.05,
    )

val DII_GLOBAL_SD: Map<String, Double> =
    mapOf(
        "fiber" to 4.9,
        "omega3" to 1.06,
        "vitaminC" to 43.46,
        "vitaminD" to 2.21,
        "vitaminE" to 1.49,
        "saturatedFat" to 8.0,
        "transFat" to 3.75,
        "alcohol" to 3.72,
        "caffeine" to 6.67,
    )

val ZERO_VALID_NUTRIENTS: Set<String> = setOf("alcohol", "transFat", "caffeine")
const val DII_NEUTRAL_CUTPOINT = 1.0
const val DII_FULL_INDEX_ABS_COEF_SUM = 13.152
const val DII_CAFFEINE_MG_PER_TABLE_UNIT = 1000.0

const val KCAL_PER_KG_FAT = 7700.0
const val KCAL_PER_KG_MUSCLE = 1800.0
const val DEFAULT_MUSCLE_RATIO = 0.3
const val EXPENDITURE_PER_KG_KCAL_PER_DAY = 22.0

const val PLATEAU_THRESHOLD_KG_PER_WEEK = 0.1
const val PLATEAU_MIN_SPAN_DAYS = 10

const val OMEGA_RATIO_OPTIMAL_MAX = 11.0
const val OMEGA_RATIO_ELEVATED_MAX = 20.0

const val MIN_NUTRIENT_COVERAGE = 0.7

const val DEFAULT_CAFFEINE_CUTOFF_HOUR = 14

const val PROTEIN_TARGET_FEEDINGS_PER_DAY = 3
const val PROTEIN_PER_MEAL_G_PER_KG = 0.4
const val PROTEIN_DEFAULT_PER_MEAL_G = 20.0
