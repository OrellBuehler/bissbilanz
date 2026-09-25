package com.bissbilanz.util

import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.api.generated.model.RecipeIngredient
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

class RecipeMacrosTest {
    private fun food(
        id: String,
        servingSize: Double,
        servingUnit: Food.ServingUnit,
        calories: Double,
    ) = Food(
        id = id,
        userId = "user-1",
        name = "Food $id",
        servingSize = servingSize,
        servingUnit = servingUnit,
        calories = calories,
        protein = 0.0,
        carbs = 0.0,
        fat = 0.0,
        fiber = 0.0,
        brand = null,
        barcode = null,
        isFavorite = false,
        nutriScore = null,
        novaGroup = null,
        additives = null,
        ingredientsText = null,
        imageUrl = null,
    )

    private fun ingredient(
        foodId: String,
        quantity: Double,
        servingUnit: RecipeIngredient.ServingUnit,
    ) = RecipeIngredient(
        foodId = foodId,
        quantity = quantity,
        servingUnit = servingUnit,
        sortOrder = 0,
    )

    @Test
    fun convertsVolumeUnitIntoFoodsOwnUnit() {
        // 100 ml of oil = 200 kcal, so 2 tbsp (30 ml) = 60 kcal.
        val oil = food("oil", servingSize = 100.0, servingUnit = Food.ServingUnit.ml, calories = 200.0)
        val ingredients = listOf(ingredient("oil", quantity = 2.0, servingUnit = RecipeIngredient.ServingUnit.tbsp))

        val macros = computeRecipePerServingMacros(ingredients, totalServings = 1.0) { oil }

        assertNotNull(macros)
        assertEquals(60.0, macros.calories, 1e-9)
    }

    @Test
    fun sameUnitIsUnaffected() {
        val oats = food("oats", servingSize = 100.0, servingUnit = Food.ServingUnit.g, calories = 380.0)
        val ingredients = listOf(ingredient("oats", quantity = 50.0, servingUnit = RecipeIngredient.ServingUnit.g))

        val macros = computeRecipePerServingMacros(ingredients, totalServings = 1.0) { oats }

        assertNotNull(macros)
        assertEquals(190.0, macros.calories, 1e-9)
    }

    @Test
    fun legacyCrossDimensionRowFallsBackToRawQuantity() {
        val flour = food("flour", servingSize = 100.0, servingUnit = Food.ServingUnit.g, calories = 364.0)
        // 50 "ml" against a food measured in g — cannot happen for new input (rejected
        // server-side), but a pre-existing row must keep producing the same numbers.
        val ingredients = listOf(ingredient("flour", quantity = 50.0, servingUnit = RecipeIngredient.ServingUnit.ml))

        val macros = computeRecipePerServingMacros(ingredients, totalServings = 1.0) { flour }

        assertNotNull(macros)
        assertEquals(182.0, macros.calories, 1e-9)
    }
}
