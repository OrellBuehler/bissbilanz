package com.bissbilanz.util

import com.bissbilanz.api.generated.model.RecipeIngredient
import kotlin.test.Test
import kotlin.test.assertEquals

class RecipeScalingTest {
    private fun ingredient(
        foodId: String,
        quantity: Double,
        sortOrder: Int,
    ) = RecipeIngredient(foodId, quantity, RecipeIngredient.ServingUnit.g, sortOrder)

    @Test
    fun scaleSourceIngredientsOrdersBySortOrderAndScales() {
        val scaled =
            scaleSourceIngredients(
                listOf(ingredient("c", 30.0, 2), ingredient("a", 10.0, 0), ingredient("b", 20.0, 1)),
                2.0,
            )
        assertEquals(listOf("a", "b", "c"), scaled.map { it.foodId })
        assertEquals(listOf(20.0, 40.0, 60.0), scaled.map { it.quantity })
    }
}
