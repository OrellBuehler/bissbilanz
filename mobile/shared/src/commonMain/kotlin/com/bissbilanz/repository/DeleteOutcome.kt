package com.bissbilanz.repository

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
    ) : DeleteOutcome()
}

/** Shape of the 409 `has_entries` body from DELETE /api/foods/{id} and /api/recipes/{id}. */
@Serializable
internal data class DeleteConflictBody(
    val entryCount: Int = 0,
    val ingredientCount: Int? = null,
    val recipeCount: Int? = null,
)
