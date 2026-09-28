package com.bissbilanz.foodpackage

import com.bissbilanz.api.generated.model.FoodPackageAction
import com.bissbilanz.api.generated.model.FoodPackageFoodRole
import com.bissbilanz.api.generated.model.FoodPackageMapping
import com.bissbilanz.api.generated.model.FoodPackageNewFoodItem
import com.bissbilanz.api.generated.model.FoodPackagePreviewResponse
import com.bissbilanz.api.generated.model.FoodPackageResolutions
import com.bissbilanz.util.isSameUnitDimension

/** One of the user's own foods chosen to stand in for a new incoming food. */
data class MappedFood(
    val id: String,
    val name: String,
    val brand: String?,
    val servingSize: Double,
    val servingUnit: String,
    val imageUrl: String? = null,
)

/**
 * Review-time bookkeeping for "use one of my foods instead" on the import preview. Mirrors the
 * mapping half of the web's `foodPackage.ts`, so both clients send the same `mappings`.
 */
object FoodPackageMappingState {
    fun set(
        state: Map<String, MappedFood>,
        ref: String,
        food: MappedFood,
    ): Map<String, MappedFood> = state + (ref to food)

    fun clear(
        state: Map<String, MappedFood>,
        ref: String,
    ): Map<String, MappedFood> = state - ref

    /** A food of the user can stand in for an incoming one when both measure in mass or both in volume. */
    fun isCompatible(
        item: FoodPackageNewFoodItem,
        food: MappedFood,
    ): Boolean = isSameUnitDimension(food.servingUnit, item.servingUnit.value)

    /** The user's foods that could stand in for the incoming one, in the caller's order. */
    fun candidates(
        foods: List<MappedFood>,
        item: FoodPackageNewFoodItem,
        limit: Int,
    ): List<MappedFood> = foods.filter { isCompatible(item, it) }.take(limit)

    /** A starting search term for an incoming food: its first meaningful word. */
    fun suggestedQuery(name: String): String = name.split(Regex("[\\s,/()-]+")).firstOrNull { it.length >= 3 } ?: name.trim()

    /**
     * The new foods the import would still create: not mapped onto one of the user's foods and,
     * for foods that only came along as ingredients, used by at least one recipe that is
     * actually imported (a recipe resolved to Skip is not).
     */
    fun foodsToCreate(
        items: List<FoodPackageNewFoodItem>,
        mappings: Map<String, MappedFood>,
        recipes: Map<String, FoodPackageAction>,
    ): List<FoodPackageNewFoodItem> =
        items.filter { item ->
            when {
                item.ref in mappings -> false
                item.role == FoodPackageFoodRole.selected -> true
                else -> item.recipes.any { (recipes[it.ref] ?: FoodPackageAction.skip) != FoodPackageAction.skip }
            }
        }

    /** Mappings to send: only refs the preview offered, in preview order. */
    fun toMappings(
        items: List<FoodPackageNewFoodItem>,
        mappings: Map<String, MappedFood>,
    ): List<FoodPackageMapping> = items.mapNotNull { item -> mappings[item.ref]?.let { FoodPackageMapping(item.ref, it.id) } }

    fun toResolutions(
        preview: FoodPackagePreviewResponse,
        foods: Map<String, FoodPackageAction>,
        recipes: Map<String, FoodPackageAction>,
        mappings: Map<String, MappedFood>,
    ): FoodPackageResolutions =
        FoodPackageResolutionState
            .toResolutions(preview, foods, recipes)
            .copy(mappings = toMappings(preview.newFoods.items, mappings))
}
