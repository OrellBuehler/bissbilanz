package com.bissbilanz.model

import com.bissbilanz.test.testJson
import kotlinx.serialization.encodeToString
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull

class EntrySerializationTest {
    private val json = testJson

    @Test
    fun serializeAndDeserializeEntryRoundTrip() {
        val entry =
            Entry(
                id = "entry-1",
                userId = "user-1",
                foodId = "food-1",
                date = "2024-01-15",
                mealType = "lunch",
                servings = 1.5,
                notes = "With salad",
            )
        val encoded = json.encodeToString(entry)
        val decoded = json.decodeFromString<Entry>(encoded)
        assertEquals(entry, decoded)
    }

    @Test
    fun deserializeEntryWithNestedFood() {
        val jsonStr =
            """
            {
                "id": "e1",
                "userId": "u1",
                "foodId": "f1",
                "date": "2024-01-15",
                "mealType": "breakfast",
                "servings": 2.0,
                "food": {
                    "id": "f1",
                    "userId": "u1",
                    "name": "Oatmeal",
                    "servingSize": 40.0,
                    "servingUnit": "g",
                    "calories": 150.0,
                    "protein": 5.0,
                    "carbs": 27.0,
                    "fat": 3.0,
                    "fiber": 4.0,
                    "brand": null,
                    "barcode": null,
                    "isFavorite": false,
                    "nutriScore": null,
                    "novaGroup": null,
                    "additives": null,
                    "ingredientsText": null,
                    "imageUrl": null
                }
            }
            """.trimIndent()
        val entry = json.decodeFromString<Entry>(jsonStr)
        assertEquals("Oatmeal", entry.food?.name)
        assertEquals(150.0, entry.food?.calories)
        assertEquals(2.0, entry.servings)
    }

    @Test
    fun deserializeQuickEntry() {
        val jsonStr =
            """
            {
                "id": "e2",
                "userId": "u1",
                "date": "2024-01-15",
                "mealType": "snack",
                "servings": 1.0,
                "quickName": "Protein Bar",
                "quickCalories": 200.0,
                "quickProtein": 20.0,
                "quickCarbs": 25.0,
                "quickFat": 8.0,
                "quickFiber": 3.0
            }
            """.trimIndent()
        val entry = json.decodeFromString<Entry>(jsonStr)
        assertEquals("Protein Bar", entry.quickName)
        assertEquals(200.0, entry.quickCalories)
        assertNull(entry.foodId)
        assertNull(entry.food)
    }

    @Test
    fun entryCreateSerializationOmitsNulls() {
        val create =
            EntryCreate(
                foodId = "f1",
                mealType = "dinner",
                servings = 1.0,
                date = "2024-01-15",
            )
        val encoded = json.encodeToString(create)
        assertFalse(encoded.contains("recipeId"))
        assertFalse(encoded.contains("notes"))
        assertFalse(encoded.contains("quickName"))
        assertEquals("dinner", json.decodeFromString<EntryCreate>(encoded).mealType)
    }

    @Test
    fun entryUpdateAllFieldsNullable() {
        val update = EntryUpdate()
        val encoded = json.encodeToString(update)
        val decoded = json.decodeFromString<EntryUpdate>(encoded)
        assertNull(decoded.mealType)
        assertNull(decoded.servings)
        assertNull(decoded.date)
    }
}
