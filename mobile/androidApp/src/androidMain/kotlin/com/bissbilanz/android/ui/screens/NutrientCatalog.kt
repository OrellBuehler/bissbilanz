package com.bissbilanz.android.ui.screens

import androidx.compose.runtime.*
import androidx.compose.ui.res.stringResource
import com.bissbilanz.android.R

val ALL_NUTRIENT_KEYS =
    listOf(
        "saturatedFat",
        "monounsaturatedFat",
        "polyunsaturatedFat",
        "transFat",
        "cholesterol",
        "omega3",
        "omega6",
        "sugar",
        "addedSugars",
        "sugarAlcohols",
        "starch",
        "sodium",
        "potassium",
        "calcium",
        "iron",
        "magnesium",
        "phosphorus",
        "zinc",
        "copper",
        "manganese",
        "selenium",
        "iodine",
        "fluoride",
        "chromium",
        "molybdenum",
        "chloride",
        "vitaminA",
        "vitaminC",
        "vitaminD",
        "vitaminE",
        "vitaminK",
        "vitaminB1",
        "vitaminB2",
        "vitaminB3",
        "vitaminB5",
        "vitaminB6",
        "vitaminB7",
        "vitaminB9",
        "vitaminB12",
        "caffeine",
        "alcohol",
        "water",
        "salt",
    )

@Composable
fun nutrientCategories() =
    listOf(
        stringResource(R.string.nutrient_category_fat_breakdown) to
            listOf(
                "saturatedFat" to stringResource(R.string.nutrient_saturated_fat),
                "monounsaturatedFat" to stringResource(R.string.nutrient_monounsaturated_fat_full),
                "polyunsaturatedFat" to stringResource(R.string.nutrient_polyunsaturated_fat_full),
                "transFat" to stringResource(R.string.nutrient_trans_fat),
                "cholesterol" to stringResource(R.string.nutrient_cholesterol),
                "omega3" to stringResource(R.string.nutrient_omega3),
                "omega6" to stringResource(R.string.nutrient_omega6),
            ),
        stringResource(R.string.nutrient_category_sugar_carb) to
            listOf(
                "sugar" to stringResource(R.string.nutrient_sugar),
                "addedSugars" to stringResource(R.string.nutrient_added_sugars),
                "sugarAlcohols" to stringResource(R.string.nutrient_sugar_alcohols),
                "starch" to stringResource(R.string.nutrient_starch),
            ),
        stringResource(R.string.nutrient_category_mineral) to
            listOf(
                "sodium" to stringResource(R.string.nutrient_sodium),
                "potassium" to stringResource(R.string.nutrient_potassium),
                "calcium" to stringResource(R.string.nutrient_calcium),
                "iron" to stringResource(R.string.nutrient_iron),
                "magnesium" to stringResource(R.string.nutrient_magnesium),
                "phosphorus" to stringResource(R.string.nutrient_phosphorus),
                "zinc" to stringResource(R.string.nutrient_zinc),
                "copper" to stringResource(R.string.nutrient_copper),
                "manganese" to stringResource(R.string.nutrient_manganese),
                "selenium" to stringResource(R.string.nutrient_selenium),
                "iodine" to stringResource(R.string.nutrient_iodine),
                "fluoride" to stringResource(R.string.nutrient_fluoride),
                "chromium" to stringResource(R.string.nutrient_chromium),
                "molybdenum" to stringResource(R.string.nutrient_molybdenum),
                "chloride" to stringResource(R.string.nutrient_chloride),
            ),
        stringResource(R.string.nutrient_category_vitamin) to
            listOf(
                "vitaminA" to stringResource(R.string.nutrient_vitamin_a),
                "vitaminC" to stringResource(R.string.nutrient_vitamin_c),
                "vitaminD" to stringResource(R.string.nutrient_vitamin_d),
                "vitaminE" to stringResource(R.string.nutrient_vitamin_e),
                "vitaminK" to stringResource(R.string.nutrient_vitamin_k),
                "vitaminB1" to stringResource(R.string.nutrient_vitamin_b1),
                "vitaminB2" to stringResource(R.string.nutrient_vitamin_b2),
                "vitaminB3" to stringResource(R.string.nutrient_vitamin_b3),
                "vitaminB5" to stringResource(R.string.nutrient_vitamin_b5),
                "vitaminB6" to stringResource(R.string.nutrient_vitamin_b6),
                "vitaminB7" to stringResource(R.string.nutrient_vitamin_b7),
                "vitaminB9" to stringResource(R.string.nutrient_vitamin_b9),
                "vitaminB12" to stringResource(R.string.nutrient_vitamin_b12),
            ),
        stringResource(R.string.nutrient_category_other) to
            listOf(
                "caffeine" to stringResource(R.string.nutrient_caffeine),
                "alcohol" to stringResource(R.string.nutrient_alcohol),
                "water" to stringResource(R.string.nutrient_water),
                "salt" to stringResource(R.string.nutrient_salt),
            ),
    )
