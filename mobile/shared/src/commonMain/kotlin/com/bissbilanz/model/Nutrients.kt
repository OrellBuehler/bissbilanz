package com.bissbilanz.model

import kotlinx.serialization.Serializable

@Serializable
data class Nutrients(
    val calories: Double = 0.0,
    val protein: Double = 0.0,
    val carbs: Double = 0.0,
    val fat: Double = 0.0,
    val fiber: Double = 0.0,
    // Fat breakdown
    val saturatedFat: Double? = null,
    val monounsaturatedFat: Double? = null,
    val polyunsaturatedFat: Double? = null,
    val transFat: Double? = null,
    val cholesterol: Double? = null,
    val omega3: Double? = null,
    val omega6: Double? = null,
    // Sugar & carb details
    val sugar: Double? = null,
    val addedSugars: Double? = null,
    val sugarAlcohols: Double? = null,
    val starch: Double? = null,
    // Minerals
    val sodium: Double? = null,
    val potassium: Double? = null,
    val calcium: Double? = null,
    val iron: Double? = null,
    val magnesium: Double? = null,
    val phosphorus: Double? = null,
    val zinc: Double? = null,
    val copper: Double? = null,
    val manganese: Double? = null,
    val selenium: Double? = null,
    val iodine: Double? = null,
    val fluoride: Double? = null,
    val chromium: Double? = null,
    val molybdenum: Double? = null,
    val chloride: Double? = null,
    // Vitamins
    val vitaminA: Double? = null,
    val vitaminC: Double? = null,
    val vitaminD: Double? = null,
    val vitaminE: Double? = null,
    val vitaminK: Double? = null,
    val vitaminB1: Double? = null,
    val vitaminB2: Double? = null,
    val vitaminB3: Double? = null,
    val vitaminB5: Double? = null,
    val vitaminB6: Double? = null,
    val vitaminB7: Double? = null,
    val vitaminB9: Double? = null,
    val vitaminB12: Double? = null,
    // Other
    val caffeine: Double? = null,
    val alcohol: Double? = null,
    val water: Double? = null,
    val salt: Double? = null,
)
