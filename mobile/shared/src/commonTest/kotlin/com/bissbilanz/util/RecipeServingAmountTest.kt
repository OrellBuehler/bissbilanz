package com.bissbilanz.util

import com.bissbilanz.api.generated.model.RecipeIngredient
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class RecipeServingAmountTest {
    private fun ingredient(
        quantity: Double,
        servingUnit: RecipeIngredient.ServingUnit,
    ) = RecipeIngredient(
        foodId = "food",
        quantity = quantity,
        servingUnit = servingUnit,
        sortOrder = 0,
    )

    @Test
    fun cookedWeightWinsAndIsExact() {
        val result = recipeServingAmount(1400.0, 7.0, listOf(ingredient(100.0, RecipeIngredient.ServingUnit.g)))

        assertNotNull(result)
        assertEquals(200.0, result.amount, 1e-9)
        assertEquals("g", result.unit)
        assertFalse(result.isEstimated)
    }

    @Test
    fun mixedGramsAndMillilitresEstimateInGrams() {
        val g = RecipeIngredient.ServingUnit.g
        val ingredients =
            listOf(
                ingredient(500.0, g),
                ingredient(500.0, g),
                ingredient(80.0, g),
                ingredient(27.0, g),
                ingredient(10.0, g),
                ingredient(9.0, g),
                ingredient(25.0, g),
                ingredient(215.0, RecipeIngredient.ServingUnit.ml),
            )

        val result = recipeServingAmount(null, 7.0, ingredients)

        assertNotNull(result)
        assertEquals(1366.0 / 7.0, result.amount, 1e-9)
        assertEquals("g", result.unit)
        assertTrue(result.isEstimated)
    }

    @Test
    fun everyVolumeIngredientGivesMillilitres() {
        val ingredients =
            listOf(
                ingredient(250.0, RecipeIngredient.ServingUnit.ml),
                ingredient(2.0, RecipeIngredient.ServingUnit.tbsp),
                ingredient(1.0, RecipeIngredient.ServingUnit.cup),
            )

        val result = recipeServingAmount(null, 5.0, ingredients)

        assertNotNull(result)
        assertEquals(104.0, result.amount, 1e-9)
        assertEquals("ml", result.unit)
        assertTrue(result.isEstimated)
    }

    @Test
    fun nonBaseUnitsConvertToGramsAndMillilitresFirst() {
        val mass =
            recipeServingAmount(
                null,
                4.0,
                listOf(ingredient(1.5, RecipeIngredient.ServingUnit.kg), ingredient(0.5, RecipeIngredient.ServingUnit.l)),
            )
        val volume = recipeServingAmount(null, 2.0, listOf(ingredient(0.5, RecipeIngredient.ServingUnit.l)))

        assertNotNull(mass)
        assertEquals(500.0, mass.amount, 1e-9)
        assertEquals("g", mass.unit)
        assertNotNull(volume)
        assertEquals(250.0, volume.amount, 1e-9)
        assertEquals("ml", volume.unit)
    }

    @Test
    fun zeroCookedWeightFallsBackToTheIngredients() {
        val result = recipeServingAmount(0.0, 2.0, listOf(ingredient(100.0, RecipeIngredient.ServingUnit.g)))

        assertNotNull(result)
        assertEquals(50.0, result.amount, 1e-9)
        assertTrue(result.isEstimated)
    }

    @Test
    fun isNullWithoutACookedWeightAndWithoutIngredients() {
        assertNull(recipeServingAmount(null, 4.0, emptyList()))
        assertNull(recipeServingAmount(0.0, 4.0, emptyList()))
    }

    @Test
    fun isNullForANonPositiveTotalServings() {
        val ingredients = listOf(ingredient(100.0, RecipeIngredient.ServingUnit.g))

        assertNull(recipeServingAmount(800.0, 0.0, ingredients))
        assertNull(recipeServingAmount(null, -2.0, ingredients))
    }

    @Test
    fun isNullWhenTheIngredientAmountsAddUpToNothing() {
        assertNull(recipeServingAmount(null, 4.0, listOf(ingredient(0.0, RecipeIngredient.ServingUnit.g))))
    }
}
