package com.bissbilanz.android.ui.components.insights

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.bissbilanz.android.R

/**
 * Localized label for a nutrient/macro field key (e.g. "vitaminC", "protein"), as used
 * across the analytics/insights cards. Falls back to a capitalized version of the raw
 * key for anything not in the known nutrient set.
 */
@Composable
fun nutrientDisplayName(key: String): String =
    when (key) {
        "calories" -> stringResource(R.string.macro_calories)
        "protein" -> stringResource(R.string.macro_protein)
        "carbs" -> stringResource(R.string.macro_carbs)
        "fat" -> stringResource(R.string.macro_fat)
        "fiber" -> stringResource(R.string.macro_fiber)
        "saturatedFat" -> stringResource(R.string.nutrient_saturated_fat)
        "monounsaturatedFat" -> stringResource(R.string.nutrient_monounsaturated_fat_full)
        "polyunsaturatedFat" -> stringResource(R.string.nutrient_polyunsaturated_fat_full)
        "transFat" -> stringResource(R.string.nutrient_trans_fat)
        "cholesterol" -> stringResource(R.string.nutrient_cholesterol)
        "omega3" -> stringResource(R.string.nutrient_omega3)
        "omega6" -> stringResource(R.string.nutrient_omega6)
        "sugar" -> stringResource(R.string.nutrient_sugar)
        "addedSugars" -> stringResource(R.string.nutrient_added_sugars)
        "sugarAlcohols" -> stringResource(R.string.nutrient_sugar_alcohols)
        "starch" -> stringResource(R.string.nutrient_starch)
        "sodium" -> stringResource(R.string.nutrient_sodium)
        "potassium" -> stringResource(R.string.nutrient_potassium)
        "calcium" -> stringResource(R.string.nutrient_calcium)
        "iron" -> stringResource(R.string.nutrient_iron)
        "magnesium" -> stringResource(R.string.nutrient_magnesium)
        "phosphorus" -> stringResource(R.string.nutrient_phosphorus)
        "zinc" -> stringResource(R.string.nutrient_zinc)
        "copper" -> stringResource(R.string.nutrient_copper)
        "manganese" -> stringResource(R.string.nutrient_manganese)
        "selenium" -> stringResource(R.string.nutrient_selenium)
        "iodine" -> stringResource(R.string.nutrient_iodine)
        "fluoride" -> stringResource(R.string.nutrient_fluoride)
        "chromium" -> stringResource(R.string.nutrient_chromium)
        "molybdenum" -> stringResource(R.string.nutrient_molybdenum)
        "chloride" -> stringResource(R.string.nutrient_chloride)
        "vitaminA" -> stringResource(R.string.nutrient_vitamin_a)
        "vitaminC" -> stringResource(R.string.nutrient_vitamin_c)
        "vitaminD" -> stringResource(R.string.nutrient_vitamin_d)
        "vitaminE" -> stringResource(R.string.nutrient_vitamin_e)
        "vitaminK" -> stringResource(R.string.nutrient_vitamin_k)
        "vitaminB1" -> stringResource(R.string.nutrient_vitamin_b1)
        "vitaminB2" -> stringResource(R.string.nutrient_vitamin_b2)
        "vitaminB3" -> stringResource(R.string.nutrient_vitamin_b3)
        "vitaminB5" -> stringResource(R.string.nutrient_vitamin_b5)
        "vitaminB6" -> stringResource(R.string.nutrient_vitamin_b6)
        "vitaminB7" -> stringResource(R.string.nutrient_vitamin_b7)
        "vitaminB9" -> stringResource(R.string.nutrient_vitamin_b9)
        "vitaminB12" -> stringResource(R.string.nutrient_vitamin_b12)
        "caffeine" -> stringResource(R.string.nutrient_caffeine)
        "alcohol" -> stringResource(R.string.nutrient_alcohol)
        "water" -> stringResource(R.string.nutrient_water)
        "salt" -> stringResource(R.string.nutrient_salt)
        else -> key.replaceFirstChar { it.uppercase() }
    }
