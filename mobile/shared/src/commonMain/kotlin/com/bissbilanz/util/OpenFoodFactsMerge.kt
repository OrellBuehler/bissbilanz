package com.bissbilanz.util

import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.FoodCreate
import com.bissbilanz.api.generated.model.OpenFoodFactsProduct
import com.bissbilanz.api.generated.model.ServingUnit

/**
 * Builds a [FoodCreate] payload by overlaying [product] data onto [baseline].
 *
 * Rules:
 * - Identity + core macros (name, serving, calories, P/C/F/fiber, brand, barcode,
 *   isFavorite) come from [baseline] — the user already committed to those values.
 * - Detailed nutrients, NutriScore, NOVA, additives, ingredients, imageUrl come from
 *   [product] with fallback to [baseline] when the product field is null.
 *
 * Used both by the "enrich existing food" flow and (in later plans) by the
 * "create food from barcode after miss" flow.
 */
fun mergeOpenFoodFactsOntoFood(
    baseline: Food,
    product: OpenFoodFactsProduct,
): FoodCreate =
    FoodCreate(
        name = baseline.name,
        servingSize = baseline.servingSize,
        servingUnit = ServingUnit.valueOf(baseline.servingUnit.name),
        calories = baseline.calories,
        protein = baseline.protein,
        carbs = baseline.carbs,
        fat = baseline.fat,
        fiber = baseline.fiber,
        brand = baseline.brand,
        barcode = baseline.barcode,
        isFavorite = baseline.isFavorite,
        nutriScore = product.nutriScore?.let { FoodCreate.NutriScore.valueOf(it.name) },
        novaGroup = product.novaGroup?.toInt(),
        additives = product.additives ?: baseline.additives,
        ingredientsText = product.ingredientsText ?: baseline.ingredientsText,
        imageUrl = product.imageUrl ?: baseline.imageUrl,
        // Raw OFF categories; the server derives the food's labels from them.
        categoriesTags = product.categoriesTags,
        saturatedFat = product.saturatedFat ?: baseline.saturatedFat,
        monounsaturatedFat = product.monounsaturatedFat ?: baseline.monounsaturatedFat,
        polyunsaturatedFat = product.polyunsaturatedFat ?: baseline.polyunsaturatedFat,
        transFat = product.transFat ?: baseline.transFat,
        cholesterol = product.cholesterol ?: baseline.cholesterol,
        omega3 = product.omega3 ?: baseline.omega3,
        omega6 = product.omega6 ?: baseline.omega6,
        sugar = product.sugar ?: baseline.sugar,
        addedSugars = product.addedSugars ?: baseline.addedSugars,
        sugarAlcohols = product.sugarAlcohols ?: baseline.sugarAlcohols,
        starch = product.starch ?: baseline.starch,
        sodium = product.sodium ?: baseline.sodium,
        potassium = product.potassium ?: baseline.potassium,
        calcium = product.calcium ?: baseline.calcium,
        iron = product.iron ?: baseline.iron,
        magnesium = product.magnesium ?: baseline.magnesium,
        phosphorus = product.phosphorus ?: baseline.phosphorus,
        zinc = product.zinc ?: baseline.zinc,
        copper = product.copper ?: baseline.copper,
        manganese = product.manganese ?: baseline.manganese,
        selenium = product.selenium ?: baseline.selenium,
        iodine = product.iodine ?: baseline.iodine,
        fluoride = product.fluoride ?: baseline.fluoride,
        chromium = product.chromium ?: baseline.chromium,
        molybdenum = product.molybdenum ?: baseline.molybdenum,
        chloride = product.chloride ?: baseline.chloride,
        vitaminA = product.vitaminA ?: baseline.vitaminA,
        vitaminC = product.vitaminC ?: baseline.vitaminC,
        vitaminD = product.vitaminD ?: baseline.vitaminD,
        vitaminE = product.vitaminE ?: baseline.vitaminE,
        vitaminK = product.vitaminK ?: baseline.vitaminK,
        vitaminB1 = product.vitaminB1 ?: baseline.vitaminB1,
        vitaminB2 = product.vitaminB2 ?: baseline.vitaminB2,
        vitaminB3 = product.vitaminB3 ?: baseline.vitaminB3,
        vitaminB5 = product.vitaminB5 ?: baseline.vitaminB5,
        vitaminB6 = product.vitaminB6 ?: baseline.vitaminB6,
        vitaminB7 = product.vitaminB7 ?: baseline.vitaminB7,
        vitaminB9 = product.vitaminB9 ?: baseline.vitaminB9,
        vitaminB12 = product.vitaminB12 ?: baseline.vitaminB12,
        caffeine = product.caffeine ?: baseline.caffeine,
        alcohol = product.alcohol ?: baseline.alcohol,
        water = product.water ?: baseline.water,
        salt = product.salt ?: baseline.salt,
    )

/**
 * Builds a [FoodCreate] straight from an Open Food Facts [product] for the
 * "create food from barcode after a personal-database miss" flow. Mirrors the
 * iOS barcode scanner, which creates a local food from the OFF hit so the user
 * lands on its detail instead of an empty form.
 */
fun openFoodFactsProductToFoodCreate(
    product: OpenFoodFactsProduct,
    barcode: String,
): FoodCreate =
    FoodCreate(
        name = product.name,
        servingSize = product.servingSize ?: 100.0,
        servingUnit = ServingUnit.decode(product.servingUnit) ?: ServingUnit.g,
        calories = product.calories,
        protein = product.protein,
        carbs = product.carbs,
        fat = product.fat,
        fiber = product.fiber,
        brand = product.brand,
        barcode = barcode,
        nutriScore = product.nutriScore?.let { FoodCreate.NutriScore.valueOf(it.name) },
        novaGroup = product.novaGroup?.toInt(),
        additives = product.additives,
        ingredientsText = product.ingredientsText,
        imageUrl = product.imageUrl,
        categoriesTags = product.categoriesTags,
        saturatedFat = product.saturatedFat,
        monounsaturatedFat = product.monounsaturatedFat,
        polyunsaturatedFat = product.polyunsaturatedFat,
        transFat = product.transFat,
        cholesterol = product.cholesterol,
        omega3 = product.omega3,
        omega6 = product.omega6,
        sugar = product.sugar,
        addedSugars = product.addedSugars,
        sugarAlcohols = product.sugarAlcohols,
        starch = product.starch,
        sodium = product.sodium,
        potassium = product.potassium,
        calcium = product.calcium,
        iron = product.iron,
        magnesium = product.magnesium,
        phosphorus = product.phosphorus,
        zinc = product.zinc,
        copper = product.copper,
        manganese = product.manganese,
        selenium = product.selenium,
        iodine = product.iodine,
        fluoride = product.fluoride,
        chromium = product.chromium,
        molybdenum = product.molybdenum,
        chloride = product.chloride,
        vitaminA = product.vitaminA,
        vitaminC = product.vitaminC,
        vitaminD = product.vitaminD,
        vitaminE = product.vitaminE,
        vitaminK = product.vitaminK,
        vitaminB1 = product.vitaminB1,
        vitaminB2 = product.vitaminB2,
        vitaminB3 = product.vitaminB3,
        vitaminB5 = product.vitaminB5,
        vitaminB6 = product.vitaminB6,
        vitaminB7 = product.vitaminB7,
        vitaminB9 = product.vitaminB9,
        vitaminB12 = product.vitaminB12,
        caffeine = product.caffeine,
        alcohol = product.alcohol,
        water = product.water,
        salt = product.salt,
    )
