package com.bissbilanz.label

/**
 * Nutrition values extracted from an OCR'd nutrition-facts panel, normalized to
 * a per-100 g / per-100 ml basis. Every field is optional — OCR is best-effort,
 * so the user always confirms and edits the result in the food edit sheet
 * before it is saved.
 *
 * Units follow the `FoodCreate` convention: macros and `salt` in grams,
 * `sodium` in milligrams. Mirrors the iOS `ParsedNutrition`.
 */
data class ParsedNutrition(
    var calories: Double? = null,
    var protein: Double? = null,
    var carbs: Double? = null,
    var fat: Double? = null,
    var fiber: Double? = null,
    var sugar: Double? = null,
    var saturatedFat: Double? = null,
    var salt: Double? = null,
    var sodium: Double? = null,
) {
    /**
     * True when nothing usable was parsed — the scan surfaces an error instead
     * of opening an empty confirmation sheet.
     */
    val isEmpty: Boolean
        get() =
            calories == null &&
                protein == null &&
                carbs == null &&
                fat == null &&
                fiber == null &&
                sugar == null &&
                saturatedFat == null &&
                salt == null &&
                sodium == null

    /**
     * True when at least one of the headline values (calories + the four macros)
     * was found.
     */
    val hasCoreMacros: Boolean
        get() = calories != null || protein != null || carbs != null || fat != null
}
