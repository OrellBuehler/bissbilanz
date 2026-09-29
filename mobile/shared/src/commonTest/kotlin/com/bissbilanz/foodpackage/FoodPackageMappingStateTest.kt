package com.bissbilanz.foodpackage

import com.bissbilanz.api.generated.model.FoodPackageAction
import com.bissbilanz.api.generated.model.FoodPackageConflicts
import com.bissbilanz.api.generated.model.FoodPackageFoodRole
import com.bissbilanz.api.generated.model.FoodPackageNewFoodItem
import com.bissbilanz.api.generated.model.FoodPackageNewFoodRecipe
import com.bissbilanz.api.generated.model.FoodPackageNewFoods
import com.bissbilanz.api.generated.model.FoodPackageNewRecipes
import com.bissbilanz.api.generated.model.FoodPackagePreviewResponse
import com.bissbilanz.api.generated.model.FoodPackageTotals
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class FoodPackageMappingStateTest {
    private fun item(
        ref: String,
        role: FoodPackageFoodRole = FoodPackageFoodRole.selected,
        unit: FoodPackageNewFoodItem.ServingUnit = FoodPackageNewFoodItem.ServingUnit.g,
        recipes: List<String> = emptyList(),
    ) = FoodPackageNewFoodItem(
        ref = ref,
        role = role,
        name = "Food $ref",
        brand = null,
        servingSize = 100.0,
        servingUnit = unit,
        calories = 100.0,
        recipes = recipes.map { FoodPackageNewFoodRecipe(it, "Recipe $it") },
    )

    private fun mine(
        id: String,
        unit: String = "g",
    ) = MappedFood(id, "Mine $id", null, 100.0, unit)

    @Test
    fun setsAndClearsAMapping() {
        val state = FoodPackageMappingState.set(emptyMap(), "f1", mine("a"))
        assertEquals(mapOf("f1" to mine("a")), state)
        assertTrue(FoodPackageMappingState.clear(state, "f1").isEmpty())
    }

    @Test
    fun onlyOffersFoodsOfTheSameUnitDimension() {
        val flour = item("f1", unit = FoodPackageNewFoodItem.ServingUnit.g)
        val foods = listOf(mine("a", "kg"), mine("b", "ml"), mine("c", "oz"), mine("d", "l"))
        assertEquals(listOf("a", "c"), FoodPackageMappingState.candidates(foods, flour, 10).map { it.id })
        assertEquals(listOf("a"), FoodPackageMappingState.candidates(foods, flour, 1).map { it.id })
        val milk = item("f2", unit = FoodPackageNewFoodItem.ServingUnit.cl)
        assertEquals(listOf("b", "d"), FoodPackageMappingState.candidates(foods, milk, 10).map { it.id })
    }

    @Test
    fun suggestsTheFirstMeaningfulWord() {
        assertEquals("Vollkorn", FoodPackageMappingState.suggestedQuery("Vollkorn Toast"))
        assertEquals("Milch", FoodPackageMappingState.suggestedQuery("H-Milch"))
        assertEquals("ab", FoodPackageMappingState.suggestedQuery(" ab "))
    }

    @Test
    fun countsWhatTheImportWouldStillCreate() {
        val items =
            listOf(
                item("f1"),
                item("f2", FoodPackageFoodRole.ingredient, recipes = listOf("r1")),
                item("f3", FoodPackageFoodRole.ingredient, recipes = listOf("r2")),
                item("f4"),
            )
        val mappings = mapOf("f4" to mine("a"))
        val recipes = mapOf("r1" to FoodPackageAction.keep_both, "r2" to FoodPackageAction.skip)
        assertEquals(listOf("f1", "f2"), FoodPackageMappingState.foodsToCreate(items, mappings, recipes).map { it.ref })
    }

    @Test
    fun sendsOnlyOfferedRefsInPreviewOrder() {
        val items = listOf(item("f1"), item("f2"))
        val mappings = mapOf("f9" to mine("z"), "f2" to mine("b"), "f1" to mine("a"))
        val sent = FoodPackageMappingState.toMappings(items, mappings)
        assertEquals(listOf("f1" to "a", "f2" to "b"), sent.map { it.ref to it.foodId })
    }

    @Test
    fun resolutionsCarryTheMappings() {
        val preview =
            FoodPackagePreviewResponse(
                packageHash = "h",
                formatVersion = 1,
                exportedAt = null,
                totals = FoodPackageTotals(1, 0, 0),
                newFoods = FoodPackageNewFoods(1, 0, emptyList(), listOf(item("f1"))),
                newRecipes = FoodPackageNewRecipes(0, emptyList()),
                conflicts = FoodPackageConflicts(emptyList(), emptyList()),
                issues = emptyList(),
            )
        val resolutions =
            FoodPackageMappingState.toResolutions(preview, emptyMap(), emptyMap(), mapOf("f1" to mine("a")))
        assertEquals("h", resolutions.packageHash)
        assertEquals(listOf("f1" to "a"), resolutions.mappings?.map { it.ref to it.foodId })
    }
}
