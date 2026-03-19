package com.bissbilanz.model

import com.bissbilanz.test.testJson
import kotlinx.serialization.encodeToString
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class FoodSerializationTest {
    private val json = testJson

    @Test
    fun serializeAndDeserializeFoodRoundTrip() {
        val food =
            Food(
                id = "food-1",
                userId = "user-1",
                name = "Apple",
                servingSize = 100.0,
                servingUnit = Food.ServingUnit.g,
                calories = 52.0,
                protein = 0.3,
                carbs = 14.0,
                fat = 0.2,
                fiber = 2.4,
                isFavorite = true,
                barcode = "1234567890",
                brand = null,
                nutriScore = null,
                novaGroup = null,
                additives = null,
                ingredientsText = null,
                imageUrl = null,
            )
        val encoded = json.encodeToString(food)
        val decoded = json.decodeFromString<Food>(encoded)
        assertEquals(food, decoded)
    }

    @Test
    fun deserializeFoodWithUnknownFieldsIgnored() {
        val jsonStr =
            """
            {
                "id": "1",
                "userId": "u1",
                "name": "Banana",
                "servingSize": 120.0,
                "servingUnit": "g",
                "calories": 89.0,
                "protein": 1.1,
                "carbs": 23.0,
                "fat": 0.3,
                "fiber": 2.6,
                "someUnknownField": "should be ignored"
            }
            """.trimIndent()
        val food = json.decodeFromString<Food>(jsonStr)
        assertEquals("Banana", food.name)
        assertEquals(89.0, food.calories)
    }

    @Test
    fun foodOptionalFieldsDefaultCorrectly() {
        val food =
            Food(
                id = "1",
                userId = "u",
                name = "Water",
                servingSize = 250.0,
                servingUnit = Food.ServingUnit.ml,
                calories = 0.0,
                protein = 0.0,
                carbs = 0.0,
                fat = 0.0,
                fiber = 0.0,
                brand = null,
                barcode = null,
                nutriScore = null,
                novaGroup = null,
                additives = null,
                ingredientsText = null,
                imageUrl = null,
            )
        assertNull(food.brand)
        assertNull(food.barcode)
        assertNull(food.saturatedFat)
        assertNull(food.vitaminC)
        assertNull(food.nutriScore)
        assertFalse(food.isFavorite)
    }

    @Test
    fun servingUnitSerializesToLowercaseJson() {
        val food =
            Food(
                id = "1",
                userId = "u",
                name = "Milk",
                servingSize = 1.0,
                servingUnit = Food.ServingUnit.cup,
                calories = 150.0,
                protein = 8.0,
                carbs = 12.0,
                fat = 8.0,
                fiber = 0.0,
                brand = null,
                barcode = null,
                nutriScore = null,
                novaGroup = null,
                additives = null,
                ingredientsText = null,
                imageUrl = null,
            )
        val encoded = json.encodeToString(food)
        assertTrue(encoded.contains("\"cup\""))
    }

    @Test
    fun deserializeAllServingUnits() {
        val units = listOf("g", "kg", "ml", "l", "oz", "lb", "fl_oz", "cup", "tbsp", "tsp")
        val expected =
            listOf(
                Food.ServingUnit.g,
                Food.ServingUnit.kg,
                Food.ServingUnit.ml,
                Food.ServingUnit.l,
                Food.ServingUnit.oz,
                Food.ServingUnit.lb,
                Food.ServingUnit.fl_oz,
                Food.ServingUnit.cup,
                Food.ServingUnit.tbsp,
                Food.ServingUnit.tsp,
            )
        units.zip(expected).forEach { (unitStr, expectedUnit) ->
            val jsonStr =
                """
                {
                    "id":"1","userId":"u","name":"X","servingSize":1.0,
                    "servingUnit":"$unitStr","calories":0,"protein":0,
                    "carbs":0,"fat":0,"fiber":0
                }
                """.trimIndent()
            val food = json.decodeFromString<Food>(jsonStr)
            assertEquals(expectedUnit, food.servingUnit)
        }
    }

    @Test
    fun foodCreateSerializationOmitsNulls() {
        val foodCreate =
            FoodCreate(
                name = "Chicken Breast",
                servingSize = 100.0,
                servingUnit = FoodCreate.ServingUnit.g,
                calories = 165.0,
                protein = 31.0,
                carbs = 0.0,
                fat = 3.6,
                fiber = 0.0,
            )
        val encoded = json.encodeToString(foodCreate)
        assertFalse(encoded.contains("brand"))
        assertFalse(encoded.contains("barcode"))
        assertTrue(encoded.contains("Chicken Breast"))
    }
}
