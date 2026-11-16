package com.bissbilanz.android.ui.components

import com.bissbilanz.api.generated.model.RecipeIngredient
import com.bissbilanz.model.Entry
import com.bissbilanz.model.Recipe
import com.bissbilanz.util.RecipeServingAmount
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class EntryServingAmountTest {
    private fun entry(
        servingSize: Double? = null,
        servingUnit: String? = null,
    ) = Entry(
        id = "e1",
        mealType = "Lunch",
        servings = 1.5,
        servingSize = servingSize,
        servingUnit = servingUnit,
    )

    private fun recipe(
        cookedWeight: Double?,
        totalServings: Double,
        ingredients: List<RecipeIngredient>,
    ) = Recipe(
        id = "r1",
        userId = "u1",
        name = "Bread",
        totalServings = totalServings,
        isFavorite = false,
        imageUrl = null,
        calories = 0.0,
        protein = 0.0,
        carbs = 0.0,
        fat = 0.0,
        fiber = 0.0,
        ingredients = ingredients,
        cookedWeight = cookedWeight,
    )

    private fun ingredient(
        quantity: Double,
        unit: RecipeIngredient.ServingUnit,
    ) = RecipeIngredient(foodId = "f", quantity = quantity, servingUnit = unit, sortOrder = 0)

    @Test
    fun aFoodEntryUsesItsOwnServingSize() {
        val amount = entryServingAmount(entry(servingSize = 50.0, servingUnit = "fl_oz"), recipe = null)

        assertEquals(RecipeServingAmount(50.0, "fl oz", isEstimated = false), amount)
    }

    @Test
    fun theFoodServingSizeWinsOverARecipe() {
        val withIngredients = recipe(null, 4.0, listOf(ingredient(400.0, RecipeIngredient.ServingUnit.g)))

        val amount = entryServingAmount(entry(servingSize = 50.0, servingUnit = "g"), withIngredients)

        assertEquals(RecipeServingAmount(50.0, "g", isEstimated = false), amount)
    }

    @Test
    fun aRecipeEntryUsesTheRecipeAmount() {
        val withCookedWeight = recipe(800.0, 4.0, emptyList())
        val withIngredients = recipe(null, 4.0, listOf(ingredient(400.0, RecipeIngredient.ServingUnit.g)))

        assertEquals(RecipeServingAmount(200.0, "g", isEstimated = false), entryServingAmount(entry(), withCookedWeight))
        assertEquals(RecipeServingAmount(100.0, "g", isEstimated = true), entryServingAmount(entry(), withIngredients))
    }

    @Test
    fun anEntryWithNothingToShowGivesNull() {
        assertNull(entryServingAmount(entry(), recipe = null))
        assertNull(entryServingAmount(entry(), recipe(null, 4.0, emptyList())))
    }

    @Test
    fun anExactAmountKeepsOneDecimal() {
        val text = servingAmountText(RecipeServingAmount(50.0, "g", isEstimated = false), servings = 0.75)

        assertEquals("0.75 × 50 g = 37.5 g", text)
    }

    @Test
    fun anEstimateIsRoundedToWholeNumbers() {
        val amount = recipeServingAmount195()

        assertEquals("1.5 × 195 g = 293 g", servingAmountText(amount, servings = 1.5))
    }

    @Test
    fun withoutUsableServingsOnlyThePerServingAmountShows() {
        val amount = RecipeServingAmount(200.0, "ml", isEstimated = false)

        assertEquals("200 ml", servingAmountText(amount, servings = null))
        assertEquals("200 ml", servingAmountText(amount, servings = 0.0))
    }

    private fun recipeServingAmount195(): RecipeServingAmount {
        val g = RecipeIngredient.ServingUnit.g
        val ingredients =
            listOf(500.0, 500.0, 80.0, 27.0, 10.0, 9.0, 25.0).map { ingredient(it, g) } +
                ingredient(215.0, RecipeIngredient.ServingUnit.ml)
        return assertNotNull(entryServingAmount(entry(), recipe(null, 7.0, ingredients)))
    }
}
