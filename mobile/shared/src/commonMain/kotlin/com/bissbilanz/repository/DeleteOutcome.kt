package com.bissbilanz.repository

import com.bissbilanz.api.generated.model.LastIngredientRecipe
import kotlinx.serialization.Serializable

/**
 * Result of a "checked" delete (see `RecipeRepository.deleteRecipeChecked`,
 * `FoodRepository.deleteFoodChecked`): the server (or, in Local mode, the local cache)
 * was asked first, so a conflict reaches the caller instead of being silently
 * dead-lettered by the sync queue.
 */
sealed class DeleteOutcome {
    data object Deleted : DeleteOutcome()

    data class Blocked(
        val entryCount: Int,
        val ingredientCount: Int? = null,
        val recipeCount: Int? = null,
        val supplementIngredientCount: Int? = null,
        /** Recipes the food is the only ingredient of (foods only). */
        val lastIngredientRecipes: List<WhereUsedRef> = emptyList(),
    ) : DeleteOutcome() {
        /**
         * Forcing cannot delete this food: it would leave a recipe without an ingredient,
         * or supplements still use it. Callers must not offer "delete anyway".
         */
        val forceUnavailable: Boolean
            get() = lastIngredientRecipes.isNotEmpty() || (supplementIngredientCount ?: 0) > 0
    }
}

/** Shape of the 409 `has_entries` body from DELETE /api/foods/{id} and /api/recipes/{id}. */
@Serializable
internal data class DeleteConflictBody(
    val entryCount: Int = 0,
    val ingredientCount: Int? = null,
    val recipeCount: Int? = null,
    val supplementIngredientCount: Int? = null,
    val lastIngredientRecipes: List<LastIngredientRecipe>? = null,
) {
    fun toBlocked() =
        DeleteOutcome.Blocked(
            entryCount = entryCount,
            ingredientCount = ingredientCount,
            recipeCount = recipeCount,
            supplementIngredientCount = supplementIngredientCount,
            lastIngredientRecipes = lastIngredientRecipes.orEmpty().map { WhereUsedRef(it.id, it.name, isLastIngredient = true) },
        )
}
