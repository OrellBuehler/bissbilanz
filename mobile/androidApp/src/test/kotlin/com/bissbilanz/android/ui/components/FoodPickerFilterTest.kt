package com.bissbilanz.android.ui.components

import com.bissbilanz.api.generated.model.Food
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class FoodPickerFilterTest {
    private fun food(
        id: String,
        name: String,
        brand: String? = null,
        unit: Food.ServingUnit = Food.ServingUnit.g,
    ) = Food(
        id = id,
        userId = "user-1",
        name = name,
        brand = brand,
        servingSize = 100.0,
        servingUnit = unit,
        calories = 100.0,
        protein = 1.0,
        carbs = 1.0,
        fat = 1.0,
        fiber = 1.0,
        barcode = null,
        nutriScore = null,
        novaGroup = null,
        additives = null,
        ingredientsText = null,
        imageUrl = null,
    )

    private val foods =
        listOf(
            food("a", "AM Gel Granatapfel", brand = "AM Sport"),
            food("b", "AM Gel Waldfrucht", brand = "AM Sport"),
            food("c", "Milch", unit = Food.ServingUnit.ml),
        )

    @Test
    fun pickableDropsExcludedIds() {
        assertEquals(listOf("b", "c"), foods.pickable(setOf("a")) { true }.map { it.id })
    }

    @Test
    fun pickableAppliesCallerFilter() {
        val volume = foods.pickable(emptySet()) { it.servingUnit == Food.ServingUnit.ml }
        assertEquals(listOf("c"), volume.map { it.id })
    }

    @Test
    fun pickableCombinesExclusionAndFilter() {
        assertEquals(emptyList(), foods.pickable(setOf("c")) { it.servingUnit == Food.ServingUnit.ml })
    }

    @Test
    fun shortQueryKeepsEverything() {
        assertEquals(foods, foods.matchingQuery("a"))
        assertEquals(foods, foods.matchingQuery(" a "))
        assertEquals(foods, foods.matchingQuery(""))
    }

    @Test
    fun queryMatchesNameCaseInsensitively() {
        assertEquals(listOf("c"), foods.matchingQuery("MILCH").map { it.id })
    }

    @Test
    fun queryMatchesBrand() {
        assertEquals(listOf("a", "b"), foods.matchingQuery("sport").map { it.id })
    }

    @Test
    fun queryIsTrimmed() {
        assertEquals(listOf("b"), foods.matchingQuery("  waldfrucht ").map { it.id })
    }

    @Test
    fun searchQueryNeedsTwoCharacters() {
        assertFalse(isSearchQuery("a"))
        assertFalse(isSearchQuery(" a "))
        assertTrue(isSearchQuery("ab"))
    }
}
