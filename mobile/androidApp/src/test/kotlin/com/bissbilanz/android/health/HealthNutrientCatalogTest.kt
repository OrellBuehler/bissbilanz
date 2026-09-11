package com.bissbilanz.android.health

import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.model.Entry
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class HealthNutrientCatalogTest {
    private fun food(
        sugar: Double? = null,
        saturatedFat: Double? = null,
        vitaminC: Double? = null,
        vitaminB7: Double? = null,
    ) = Food(
        id = "food-1",
        userId = "user-1",
        name = "Test Food",
        brand = null,
        servingSize = 100.0,
        servingUnit = Food.ServingUnit.g,
        calories = 100.0,
        protein = 10.0,
        carbs = 10.0,
        fat = 5.0,
        fiber = 2.0,
        barcode = null,
        nutriScore = null,
        novaGroup = null,
        additives = null,
        ingredientsText = null,
        imageUrl = null,
        sugar = sugar,
        saturatedFat = saturatedFat,
        vitaminC = vitaminC,
        vitaminB7 = vitaminB7,
    )

    private fun foodEntry(
        servings: Double,
        food: Food,
    ) = Entry(id = "entry-1", mealType = "Breakfast", servings = servings, food = food)

    @Test
    fun `sums food-backed nutrients scaled by servings, only for enabled keys`() {
        val entries =
            listOf(
                foodEntry(servings = 2.0, food = food(sugar = 5.0, vitaminC = 12.0)),
                foodEntry(servings = 1.0, food = food(sugar = 3.0, vitaminC = 6.0)),
            )
        val totals = extendedNutrientTotals(entries, enabledKeys = setOf("sugar"))
        assertEquals(mapOf("sugar" to 13.0), totals)
    }

    @Test
    fun `quick-log entries contribute nothing beyond the five core macros, matching iOS`() {
        val quickEntry =
            Entry(
                id = "entry-2",
                mealType = "Snacks",
                servings = 1.0,
                quickCalories = 100.0,
                quickNutrients = mapOf("sugar" to 20.0),
            )
        val totals = extendedNutrientTotals(listOf(quickEntry), enabledKeys = setOf("sugar"))
        assertTrue(totals.isEmpty())
    }

    @Test
    fun `returns nothing when no nutrient is enabled`() {
        val entries = listOf(foodEntry(servings = 1.0, food = food(sugar = 5.0)))
        assertTrue(extendedNutrientTotals(entries, enabledKeys = emptySet()).isEmpty())
    }

    @Test
    fun `zero and null per-serving values are skipped rather than zeroing the total`() {
        val entries =
            listOf(
                foodEntry(servings = 3.0, food = food(sugar = 0.0)),
                foodEntry(servings = 1.0, food = food(saturatedFat = 4.0)),
            )
        val totals = extendedNutrientTotals(entries, enabledKeys = setOf("sugar", "saturatedFat"))
        assertEquals(mapOf("saturatedFat" to 4.0), totals)
    }

    @Test
    fun `massOf converts each nutrient to the unit its NutritionRecord field expects`() {
        val totals = mapOf("sugar" to 10.0, "cholesterol" to 25.0, "vitaminB7" to 30.0)
        assertEquals(10.0, totals.massOf("sugar")?.inGrams)
        assertEquals(25.0, totals.massOf("cholesterol")?.inMilligrams)
        assertEquals(30.0, totals.massOf("vitaminB7")?.inMicrograms)
    }

    @Test
    fun `massOf returns null for a missing or unknown key`() {
        val totals = mapOf("sugar" to 10.0)
        assertNull(totals.massOf("vitaminC"))
        assertNull(totals.massOf("notARealNutrient"))
    }
}
