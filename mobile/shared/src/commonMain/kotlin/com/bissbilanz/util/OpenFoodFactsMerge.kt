package com.bissbilanz.util

import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.FoodCreate
import com.bissbilanz.api.generated.model.OpenFoodFactsProduct
import com.bissbilanz.api.generated.model.ServingUnit
import kotlin.math.floor

/**
 * Builds a [FoodCreate] payload by overlaying [product] data onto [baseline], by the same
 * rules as the server's `mergeOffProduct` (`src/lib/server/food-enrichment/merge.ts`), which
 * does this for a signed-in user. Used on the device in Local mode and for a food the server
 * does not have yet.
 *
 * - Identity and core macros (name, serving, calories, P/C/F/fiber, brand, barcode,
 *   isFavorite) always come from [baseline]: the user already committed to those values.
 * - Nutri-Score and NOVA group come from [product] when it has them.
 * - Additives, ingredients, the image and every detailed nutrient are only filled in where
 *   [baseline] has none; a value the user entered is never replaced. A photo matters most:
 *   the server unlinks the previous upload whenever imageUrl changes.
 * - Open Food Facts gives nutrients per 100 g or 100 ml, so they are scaled to the food's
 *   serving. A serving in a household measure (cup, tbsp, tsp) cannot be scaled, so its
 *   nutrients are left alone.
 */
fun mergeOpenFoodFactsOntoFood(
    baseline: Food,
    product: OpenFoodFactsProduct,
): FoodCreate {
    val base = baseline.toFoodCreate()
    val withQuality =
        base.copy(
            nutriScore = product.nutriScore?.let { FoodCreate.NutriScore.valueOf(it.name) } ?: base.nutriScore,
            novaGroup = product.novaGroup?.toInt() ?: base.novaGroup,
            additives = if (base.additives.isNullOrEmpty() && !product.additives.isNullOrEmpty()) product.additives else base.additives,
            ingredientsText =
                if (base.ingredientsText.isNullOrBlank() && !product.ingredientsText.isNullOrBlank()) {
                    product.ingredientsText
                } else {
                    base.ingredientsText
                },
            imageUrl = if (base.imageUrl.isNullOrBlank() && !product.imageUrl.isNullOrBlank()) product.imageUrl else base.imageUrl,
            // Raw OFF categories; the server derives the food's labels from them.
            categoriesTags = product.categoriesTags,
        )
    val scale = openFoodFactsNutrientScale(baseline.servingSize, baseline.servingUnit.value) ?: return withQuality

    fun fill(
        stored: Double?,
        perHundred: Double?,
    ): Double? =
        when {
            stored != null -> stored
            perHundred == null || !perHundred.isFinite() || perHundred < 0 -> null
            else -> roundToFourDecimals(perHundred * scale)
        }

    return withQuality.copy(
        saturatedFat = fill(base.saturatedFat, product.saturatedFat),
        monounsaturatedFat = fill(base.monounsaturatedFat, product.monounsaturatedFat),
        polyunsaturatedFat = fill(base.polyunsaturatedFat, product.polyunsaturatedFat),
        transFat = fill(base.transFat, product.transFat),
        cholesterol = fill(base.cholesterol, product.cholesterol),
        omega3 = fill(base.omega3, product.omega3),
        omega6 = fill(base.omega6, product.omega6),
        sugar = fill(base.sugar, product.sugar),
        addedSugars = fill(base.addedSugars, product.addedSugars),
        sugarAlcohols = fill(base.sugarAlcohols, product.sugarAlcohols),
        starch = fill(base.starch, product.starch),
        sodium = fill(base.sodium, product.sodium),
        potassium = fill(base.potassium, product.potassium),
        calcium = fill(base.calcium, product.calcium),
        iron = fill(base.iron, product.iron),
        magnesium = fill(base.magnesium, product.magnesium),
        phosphorus = fill(base.phosphorus, product.phosphorus),
        zinc = fill(base.zinc, product.zinc),
        copper = fill(base.copper, product.copper),
        manganese = fill(base.manganese, product.manganese),
        selenium = fill(base.selenium, product.selenium),
        iodine = fill(base.iodine, product.iodine),
        fluoride = fill(base.fluoride, product.fluoride),
        chromium = fill(base.chromium, product.chromium),
        molybdenum = fill(base.molybdenum, product.molybdenum),
        chloride = fill(base.chloride, product.chloride),
        vitaminA = fill(base.vitaminA, product.vitaminA),
        vitaminC = fill(base.vitaminC, product.vitaminC),
        vitaminD = fill(base.vitaminD, product.vitaminD),
        vitaminE = fill(base.vitaminE, product.vitaminE),
        vitaminK = fill(base.vitaminK, product.vitaminK),
        vitaminB1 = fill(base.vitaminB1, product.vitaminB1),
        vitaminB2 = fill(base.vitaminB2, product.vitaminB2),
        vitaminB3 = fill(base.vitaminB3, product.vitaminB3),
        vitaminB5 = fill(base.vitaminB5, product.vitaminB5),
        vitaminB6 = fill(base.vitaminB6, product.vitaminB6),
        vitaminB7 = fill(base.vitaminB7, product.vitaminB7),
        vitaminB9 = fill(base.vitaminB9, product.vitaminB9),
        vitaminB12 = fill(base.vitaminB12, product.vitaminB12),
        caffeine = fill(base.caffeine, product.caffeine),
        alcohol = fill(base.alcohol, product.alcohol),
        water = fill(base.water, product.water),
        salt = fill(base.salt, product.salt),
    )
}

fun FoodCreate.changes(baseline: Food) = copy(categoriesTags = null) != baseline.toFoodCreate()

private val SCALABLE_UNITS = setOf("g", "kg", "oz", "lb", "ml", "cl", "l", "fl_oz")

fun openFoodFactsNutrientScale(
    servingSize: Double,
    servingUnit: String,
): Double? {
    if (servingUnit !in SCALABLE_UNITS || !(servingSize > 0)) return null
    val base = if (unitDimensionOrNull(servingUnit) == UnitDimension.MASS) "g" else "ml"
    val factor = unitConversionFactor(servingUnit, base) ?: return null
    return servingSize * factor / 100
}

private fun roundToFourDecimals(value: Double) = floor(value * 10_000 + 0.5) / 10_000

private fun Food.toFoodCreate(): FoodCreate =
    FoodCreate(
        name = name,
        servingSize = servingSize,
        servingUnit = ServingUnit.valueOf(servingUnit.name),
        calories = calories,
        protein = protein,
        carbs = carbs,
        fat = fat,
        fiber = fiber,
        brand = brand,
        barcode = barcode,
        isFavorite = isFavorite,
        nutriScore = nutriScore?.let { score -> FoodCreate.NutriScore.entries.firstOrNull { it.value == score } },
        novaGroup = novaGroup,
        additives = additives,
        ingredientsText = ingredientsText,
        imageUrl = imageUrl,
        saturatedFat = saturatedFat,
        monounsaturatedFat = monounsaturatedFat,
        polyunsaturatedFat = polyunsaturatedFat,
        transFat = transFat,
        cholesterol = cholesterol,
        omega3 = omega3,
        omega6 = omega6,
        sugar = sugar,
        addedSugars = addedSugars,
        sugarAlcohols = sugarAlcohols,
        starch = starch,
        sodium = sodium,
        potassium = potassium,
        calcium = calcium,
        iron = iron,
        magnesium = magnesium,
        phosphorus = phosphorus,
        zinc = zinc,
        copper = copper,
        manganese = manganese,
        selenium = selenium,
        iodine = iodine,
        fluoride = fluoride,
        chromium = chromium,
        molybdenum = molybdenum,
        chloride = chloride,
        vitaminA = vitaminA,
        vitaminC = vitaminC,
        vitaminD = vitaminD,
        vitaminE = vitaminE,
        vitaminK = vitaminK,
        vitaminB1 = vitaminB1,
        vitaminB2 = vitaminB2,
        vitaminB3 = vitaminB3,
        vitaminB5 = vitaminB5,
        vitaminB6 = vitaminB6,
        vitaminB7 = vitaminB7,
        vitaminB9 = vitaminB9,
        vitaminB12 = vitaminB12,
        caffeine = caffeine,
        alcohol = alcohol,
        water = water,
        salt = salt,
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
