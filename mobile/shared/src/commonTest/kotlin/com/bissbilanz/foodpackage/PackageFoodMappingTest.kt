package com.bissbilanz.foodpackage

import com.bissbilanz.api.generated.model.FoodPackageFoodRole
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class PackageFoodMappingTest {
    private fun packageFood(nutrients: Map<String, Double>) =
        PackageFood(
            ref = "f1",
            role = FoodPackageFoodRole.selected,
            name = "Oats",
            brand = " Bio ",
            servingSize = 40.0,
            servingUnit = "g",
            calories = 150.0,
            protein = 5.0,
            carbs = 27.0,
            fat = 3.0,
            fiber = 4.0,
            nutrients = nutrients,
            barcode = "7610",
            nutriScore = "a",
            novaGroup = 1,
            additives = listOf("e330"),
            ingredientsText = "oats",
            labels = listOf("oat"),
            image = null,
            imageUrl = null,
        )

    @Test
    fun everyExtendedNutrientSurvivesAFoodRoundTrip() {
        val values = EXTENDED_NUTRIENT_KEYS.mapIndexed { index, key -> key to (index + 1) * 1.5 }.toMap()
        val food = packageFood(values).toNewFood("temp_1", "7610", "file:///x.jpg", listOf("oat"), "2026-09-28T10:00:00Z")
        assertEquals(values, food.nutrientValues())
        assertEquals("Bio", food.brand)
        assertEquals("temp_1", food.id)
        assertEquals(values, food.toPackageFood("f1", FoodPackageFoodRole.selected, null, null).nutrients)
    }

    @Test
    fun replaceOverwritesNutrientsAndKeepsIdentity() {
        val created =
            packageFood(mapOf("sodium" to 10.0, "sugar" to 2.0))
                .toNewFood("temp_1", "7610", "file:///old.jpg", listOf("oat"), "2026-01-01T00:00:00Z")
                .copy(isFavorite = true)
        val replaced =
            packageFood(mapOf("sodium" to 99.0))
                .copy(name = "Oats new", barcode = null)
                .replaceInto(created, barcode = null, imageUrl = null, labels = listOf("oat", "cereal"), now = "2026-09-28T10:00:00Z")
        assertEquals("temp_1", replaced.id)
        assertEquals(true, replaced.isFavorite)
        assertEquals("Oats new", replaced.name)
        // Barcode and image only change when the package brings one.
        assertEquals("7610", replaced.barcode)
        assertEquals("file:///old.jpg", replaced.imageUrl)
        assertEquals(mapOf("sodium" to 99.0), replaced.nutrientValues())
        assertNull(replaced.sugar)
        assertEquals("2026-01-01T00:00:00Z", replaced.createdAt)
    }
}
