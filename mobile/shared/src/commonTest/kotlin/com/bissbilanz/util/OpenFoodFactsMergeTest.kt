package com.bissbilanz.util

import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.FoodCreate
import com.bissbilanz.api.generated.model.OpenFoodFactsProduct
import com.bissbilanz.api.generated.model.ServingUnit
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class OpenFoodFactsMergeTest {
    @Test
    fun keepsBaselineNameAndServingWhileLayeringOnProductNutrition() {
        val baseline = foodFixture(name = "Haferflocken", saturatedFat = 1.0)
        val product =
            productFixture(
                calories = 380.0,
                saturatedFat = 1.5,
                vitaminC = 12.0,
                nutriScore = OpenFoodFactsProduct.NutriScore.b,
                novaGroup = 1.0,
                additives = listOf("E330"),
                ingredientsText = "Oats",
            )

        val result = mergeOpenFoodFactsOntoFood(baseline, product)

        assertEquals("Haferflocken", result.name)
        assertEquals(100.0, result.servingSize)
        assertEquals(ServingUnit.g, result.servingUnit)
        assertEquals(1.5, result.saturatedFat, "OFF saturated-fat overrides baseline")
        assertEquals(12.0, result.vitaminC, "OFF fills previously-null vitamin")
        assertEquals(FoodCreate.NutriScore.b, result.nutriScore)
        assertEquals(1, result.novaGroup, "nova group converted from Double to Int")
        assertEquals(listOf("E330"), result.additives)
        assertEquals("Oats", result.ingredientsText)
    }

    @Test
    fun keepsTheUsersOwnPhotoOverTheProductShot() {
        val baseline = foodFixture(imageUrl = "/uploads/mine.jpg")
        val product = productFixture(imageUrl = "https://off.example/product.jpg")

        val result = mergeOpenFoodFactsOntoFood(baseline, product)

        assertEquals(
            "/uploads/mine.jpg",
            result.imageUrl,
            "the server unlinks the previous upload when imageUrl changes, so enriching must not replace a user photo",
        )
    }

    @Test
    fun takesTheProductPhotoWhenTheFoodHasNone() {
        val baseline = foodFixture(imageUrl = null)
        val product = productFixture(imageUrl = "https://off.example/product.jpg")

        val result = mergeOpenFoodFactsOntoFood(baseline, product)

        assertEquals("https://off.example/product.jpg", result.imageUrl)
    }

    @Test
    fun fallsBackToBaselineWhenProductFieldIsNull() {
        val baseline = foodFixture(saturatedFat = 2.0, vitaminC = 8.0, imageUrl = "local.jpg")
        val product = productFixture(saturatedFat = null, vitaminC = null, imageUrl = null)

        val result = mergeOpenFoodFactsOntoFood(baseline, product)

        assertEquals(2.0, result.saturatedFat)
        assertEquals(8.0, result.vitaminC)
        assertEquals("local.jpg", result.imageUrl)
    }

    @Test
    fun preservesCoreMacrosFromBaselineNotProduct() {
        val baseline = foodFixture(calories = 400.0, protein = 12.0, carbs = 60.0, fat = 8.0, fiber = 10.0)
        val product = productFixture(calories = 999.0, protein = 0.0, carbs = 0.0, fat = 0.0, fiber = 0.0)

        val result = mergeOpenFoodFactsOntoFood(baseline, product)

        assertEquals(400.0, result.calories)
        assertEquals(12.0, result.protein)
        assertEquals(60.0, result.carbs)
        assertEquals(8.0, result.fat)
        assertEquals(10.0, result.fiber)
    }

    @Test
    fun dropsInvalidNutriScore() {
        val baseline = foodFixture()
        val product = productFixture(nutriScore = null)

        val result = mergeOpenFoodFactsOntoFood(baseline, product)

        assertNull(result.nutriScore)
    }

    private fun foodFixture(
        name: String = "Food",
        calories: Double = 100.0,
        protein: Double = 5.0,
        carbs: Double = 15.0,
        fat: Double = 2.0,
        fiber: Double = 3.0,
        saturatedFat: Double? = null,
        vitaminC: Double? = null,
        imageUrl: String? = null,
    ): Food =
        Food(
            id = "food-1",
            userId = "user-1",
            name = name,
            brand = null,
            servingSize = 100.0,
            servingUnit = Food.ServingUnit.g,
            calories = calories,
            protein = protein,
            carbs = carbs,
            fat = fat,
            fiber = fiber,
            barcode = "4000000000001",
            isFavorite = false,
            nutriScore = null,
            novaGroup = null,
            additives = null,
            ingredientsText = null,
            imageUrl = imageUrl,
            saturatedFat = saturatedFat,
            vitaminC = vitaminC,
        )

    private fun productFixture(
        calories: Double = 380.0,
        protein: Double = 12.0,
        carbs: Double = 60.0,
        fat: Double = 8.0,
        fiber: Double = 10.0,
        saturatedFat: Double? = null,
        vitaminC: Double? = null,
        nutriScore: OpenFoodFactsProduct.NutriScore? = null,
        novaGroup: Double? = null,
        additives: List<String>? = null,
        ingredientsText: String? = null,
        imageUrl: String? = null,
    ): OpenFoodFactsProduct =
        OpenFoodFactsProduct(
            id = "off-1",
            name = "OFF name",
            brand = "OFF brand",
            barcode = "4000000000001",
            imageUrl = imageUrl,
            nutriScore = nutriScore,
            novaGroup = novaGroup,
            servingSize = 100.0,
            servingUnit = "g",
            calories = calories,
            protein = protein,
            carbs = carbs,
            fat = fat,
            fiber = fiber,
            additives = additives,
            ingredientsText = ingredientsText,
            saturatedFat = saturatedFat,
            vitaminC = vitaminC,
        )
}
