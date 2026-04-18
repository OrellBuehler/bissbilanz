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
