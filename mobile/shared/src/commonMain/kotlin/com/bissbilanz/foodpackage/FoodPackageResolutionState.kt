package com.bissbilanz.foodpackage

import com.bissbilanz.api.generated.model.FoodPackageAction
import com.bissbilanz.api.generated.model.FoodPackageFoodConflict
import com.bissbilanz.api.generated.model.FoodPackagePreviewResponse
import com.bissbilanz.api.generated.model.FoodPackageRecipeConflict
import com.bissbilanz.api.generated.model.FoodPackageResolution
import com.bissbilanz.api.generated.model.FoodPackageResolutions

/** The minimum a conflict needs for resolution bookkeeping — shared by foods and recipes. */
data class ResolvableConflict(
    val ref: String,
    val existingId: String,
    val allowed: List<FoodPackageAction>,
)

fun FoodPackageFoodConflict.resolvable() = ResolvableConflict(ref, existing.id, allowed)

fun FoodPackageRecipeConflict.resolvable() = ResolvableConflict(ref, existing.id, allowed)

/**
 * The user's choice per conflict while reviewing a food package import. Mirrors
 * the web's `src/lib/components/food-package/foodPackage.ts` so both clients
 * resolve a package the same way.
 */
object FoodPackageResolutionState {
    /** Skip is the safe default: it never changes what the user already has. */
    fun initial(conflicts: List<ResolvableConflict>): Map<String, FoodPackageAction> =
        conflicts.associate { it.ref to FoodPackageAction.skip }

    /**
     * Pick an action for one conflict. Only one incoming item may replace a given
     * existing item, so choosing Replace demotes any other Replace on the same target.
     */
    fun set(
        state: Map<String, FoodPackageAction>,
        conflicts: List<ResolvableConflict>,
        ref: String,
        action: FoodPackageAction,
    ): Map<String, FoodPackageAction> {
        val conflict = conflicts.firstOrNull { it.ref == ref } ?: return state
        if (action !in conflict.allowed) return state
        val next = state.toMutableMap()
        next[ref] = action
        if (action == FoodPackageAction.replace) {
            conflicts
                .filter { it.ref != ref && it.existingId == conflict.existingId }
                .forEach { if (next[it.ref] == FoodPackageAction.replace) next[it.ref] = FoodPackageAction.skip }
        }
        return next
    }

    /** One action for every conflict; where not allowed (or a second Replace of one item) it falls back to Skip. */
    fun applyToAll(
        conflicts: List<ResolvableConflict>,
        action: FoodPackageAction,
    ): Map<String, FoodPackageAction> {
        val replaced = mutableSetOf<String>()
        return conflicts.associate { conflict ->
            var chosen = if (action in conflict.allowed) action else FoodPackageAction.skip
            if (chosen == FoodPackageAction.replace && !replaced.add(conflict.existingId)) {
                chosen = FoodPackageAction.skip
            }
            conflict.ref to chosen
        }
    }

    /** The action every conflict shares, or null when they differ. */
    fun common(
        conflicts: List<ResolvableConflict>,
        state: Map<String, FoodPackageAction>,
    ): FoodPackageAction? =
        conflicts
            .map { state[it.ref] ?: FoodPackageAction.skip }
            .toSet()
            .singleOrNull()

    fun toResolutions(
        preview: FoodPackagePreviewResponse,
        foods: Map<String, FoodPackageAction>,
        recipes: Map<String, FoodPackageAction>,
    ) = FoodPackageResolutions(
        packageHash = preview.packageHash,
        foods =
            preview.conflicts.foods.map {
                FoodPackageResolution(it.ref, foods[it.ref] ?: FoodPackageAction.skip, it.existing.id)
            },
        recipes =
            preview.conflicts.recipes.map {
                FoodPackageResolution(it.ref, recipes[it.ref] ?: FoodPackageAction.skip, it.existing.id)
            },
    )
}
