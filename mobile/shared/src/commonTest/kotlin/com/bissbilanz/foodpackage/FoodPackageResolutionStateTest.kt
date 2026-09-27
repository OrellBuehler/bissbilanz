package com.bissbilanz.foodpackage

import com.bissbilanz.api.generated.model.FoodPackageAction
import com.bissbilanz.api.generated.model.FoodPackageAction.keep_both
import com.bissbilanz.api.generated.model.FoodPackageAction.replace
import com.bissbilanz.api.generated.model.FoodPackageAction.skip
import com.bissbilanz.api.generated.model.FoodPackagePreviewResponse
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertSame

class FoodPackageResolutionStateTest {
    private val all = listOf(skip, replace, keep_both)
    private val conflicts =
        listOf(
            ResolvableConflict("f1", "a", all),
            ResolvableConflict("f2", "a", all),
            ResolvableConflict("f3", "b", listOf(skip, keep_both)),
        )

    @Test
    fun defaultsToSkip() {
        assertEquals(mapOf("f1" to skip, "f2" to skip, "f3" to skip), FoodPackageResolutionState.initial(conflicts))
    }

    @Test
    fun onlyOneReplacePerExistingItem() {
        var state = FoodPackageResolutionState.initial(conflicts)
        state = FoodPackageResolutionState.set(state, conflicts, "f1", replace)
        state = FoodPackageResolutionState.set(state, conflicts, "f2", replace)
        assertEquals(skip, state["f1"])
        assertEquals(replace, state["f2"])
    }

    @Test
    fun ignoresDisallowedAction() {
        val state = FoodPackageResolutionState.initial(conflicts)
        assertSame(state, FoodPackageResolutionState.set(state, conflicts, "f3", replace))
    }

    @Test
    fun applyToAllFallsBackToSkip() {
        assertEquals(
            mapOf("f1" to replace, "f2" to skip, "f3" to skip),
            FoodPackageResolutionState.applyToAll(conflicts, replace),
        )
        val keepBoth = FoodPackageResolutionState.applyToAll(conflicts, keep_both)
        assertEquals(keep_both, FoodPackageResolutionState.common(conflicts, keepBoth))
        assertNull(FoodPackageResolutionState.common(conflicts, FoodPackageResolutionState.applyToAll(conflicts, replace)))
    }

    @Test
    fun decodesPreviewAndBuildsResolutions() {
        val json = Json { ignoreUnknownKeys = true }
        val preview =
            json.decodeFromString(
                FoodPackagePreviewResponse.serializer(),
                """
                {"packageHash":"h","formatVersion":1,"exportedAt":null,
                 "totals":{"foods":1,"recipes":0,"images":0},
                 "newFoods":{"count":0,"ingredientOnly":0,"samples":[]},
                 "newRecipes":{"count":0,"samples":[]},
                 "conflicts":{"foods":[{"ref":"f1","reason":"barcode",
                   "incoming":{"name":"Oats","brand":null,"servingSize":100,"servingUnit":"g","calories":370,
                     "protein":13,"carbs":60,"fat":7,"fiber":10,"barcode":"1","labels":[],"imageUrl":null},
                   "existing":{"id":"00000000-0000-0000-0000-000000000001","name":"Hafer","brand":null,
                     "servingSize":100,"servingUnit":"g","calories":370,"protein":13,"carbs":60,"fat":7,
                     "fiber":10,"barcode":"1","labels":[],"imageUrl":null,"entryCount":2,"recipeCount":0},
                   "alsoMatches":[],"allowed":["skip","replace","keep_both"],
                   "notes":["replace_changes_history","barcode_dropped_on_keep_both"],"targetGroup":null}],
                   "recipes":[]},
                 "issues":[]}
                """.trimIndent(),
            )
        val food = preview.conflicts.foods.single()
        assertEquals(all, food.allowed)
        val resolutions =
            FoodPackageResolutionState.toResolutions(preview, mapOf("f1" to keep_both), emptyMap())
        assertEquals("h", resolutions.packageHash)
        assertEquals(FoodPackageAction.keep_both, resolutions.foods!!.single().action)
        assertEquals(food.existing.id, resolutions.foods!!.single().existingId)
    }
}
