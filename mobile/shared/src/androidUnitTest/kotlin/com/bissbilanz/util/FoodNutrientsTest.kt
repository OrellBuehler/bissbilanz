package com.bissbilanz.util

import com.bissbilanz.api.generated.model.FoodCreate
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class FoodNutrientsTest {
    private val json =
        Json {
            ignoreUnknownKeys = true
            encodeDefaults = true
        }

    private val base =
        FoodCreate(
            name = "Skyr",
            servingSize = 100.0,
            servingUnit = com.bissbilanz.api.generated.model.ServingUnit.g,
            calories = 63.0,
            protein = 11.0,
            carbs = 4.0,
            fat = 0.2,
            fiber = 0.0,
        )

    @Test
    fun `merges arbitrary nutrients by serial name`() {
        val result = base.withNutrients(mapOf("vitaminC" to 2.5, "zinc" to 0.6), json)
        assertEquals(2.5, result.vitaminC)
        assertEquals(0.6, result.zinc)
    }

    @Test
    fun `leaves the untouched fields alone`() {
        val result = base.withNutrients(mapOf("vitaminC" to 2.5), json)
        assertEquals("Skyr", result.name)
        assertEquals(63.0, result.calories)
        assertEquals(11.0, result.protein)
    }

    @Test
    fun `a null value clears the nutrient`() {
        val withValue = base.withNutrients(mapOf("zinc" to 0.6), json)
        val cleared = withValue.withNutrients(mapOf("zinc" to null), json)
        assertNull(cleared.zinc)
    }

    @Test
    fun `an unknown key is ignored rather than failing the save`() {
        val result = base.withNutrients(mapOf("notANutrient" to 1.0, "zinc" to 0.6), json)
        assertEquals(0.6, result.zinc)
        assertEquals("Skyr", result.name)
    }

    @Test
    fun `an empty map returns the original untouched`() {
        assertEquals(base, base.withNutrients(emptyMap(), json))
    }
}
