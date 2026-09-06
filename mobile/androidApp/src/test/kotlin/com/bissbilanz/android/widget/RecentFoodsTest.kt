package com.bissbilanz.android.widget

import com.bissbilanz.api.generated.model.Food
import com.bissbilanz.model.Entry
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The quick-add rows and the Assistant's food shortcuts are both this ranking, so a
 * regression here is invisible until a user notices the wrong four foods on their
 * home screen.
 */
class RecentFoodsTest {
    @Test
    fun ranksByHowOftenAFoodWasLogged() {
        val entries =
            listOf(
                entry("1", "oats", "2026-09-01"),
                entry("1", "oats", "2026-09-02"),
                entry("1", "oats", "2026-09-03"),
                entry("2", "steak", "2026-09-04"),
            )

        val ranked = RecentFoods.rank(entries, limit = 5)

        assertEquals(listOf("oats", "steak"), ranked.map { it.name })
        assertEquals(3, ranked.first().uses)
    }

    @Test
    fun breaksTiesByHowRecentlyAFoodWasLogged() {
        val entries =
            listOf(
                entry("1", "oats", "2026-09-01"),
                entry("2", "steak", "2026-09-04"),
            )

        val ranked = RecentFoods.rank(entries, limit = 5)

        assertEquals(listOf("steak", "oats"), ranked.map { it.name })
        assertEquals("2026-09-04", ranked.first().lastLoggedOn)
    }

    @Test
    fun skipsQuickLogsThatHaveNoFood() {
        val entries =
            listOf(
                entry("1", "oats", "2026-09-01"),
                Entry(id = "q", date = "2026-09-02", mealType = "Lunch", servings = 1.0, quickName = "restaurant"),
            )

        val ranked = RecentFoods.rank(entries, limit = 5)

        assertEquals(listOf("oats"), ranked.map { it.name })
    }

    @Test
    fun prefersTheEmbeddedFoodOverTheDenormalizedName() {
        val entries =
            listOf(
                entry("1", "stale name", "2026-09-01").copy(food = food("1", "current name", calories = 210.0)),
            )

        val ranked = RecentFoods.rank(entries, limit = 5)

        assertEquals("current name", ranked.single().name)
        assertEquals(210.0, ranked.single().calories)
    }

    @Test
    fun honoursTheLimit() {
        val entries = (1..10).map { entry(it.toString(), "food $it", "2026-09-0${it % 9 + 1}") }

        val ranked = RecentFoods.rank(entries, limit = 4)

        assertEquals(4, ranked.size)
        assertTrue(ranked.map { it.id }.distinct().size == 4, "the same food must not take two rows")
    }

    private fun entry(
        foodId: String,
        name: String,
        date: String,
    ): Entry =
        Entry(
            id = "entry-$foodId-$date",
            foodId = foodId,
            date = date,
            mealType = "Lunch",
            servings = 1.0,
            foodName = name,
            calories = 100.0,
        )

    private fun food(
        id: String,
        name: String,
        calories: Double,
    ): Food =
        Food(
            id = id,
            userId = "user",
            name = name,
            brand = null,
            servingSize = 100.0,
            servingUnit = Food.ServingUnit.g,
            calories = calories,
            protein = 0.0,
            carbs = 0.0,
            fat = 0.0,
            fiber = 0.0,
            barcode = null,
            isFavorite = false,
            nutriScore = null,
            novaGroup = null,
            additives = null,
            ingredientsText = null,
            imageUrl = null,
        )
}
