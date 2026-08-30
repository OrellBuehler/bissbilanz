package com.bissbilanz.sync

import com.bissbilanz.api.generated.model.EntryCreate
import com.bissbilanz.api.generated.model.EntryUpdate
import com.bissbilanz.api.generated.model.RecipeCreate
import com.bissbilanz.api.generated.model.RecipeUpdate
import com.bissbilanz.api.generated.model.SupplementCreate
import com.bissbilanz.util.decodeOrNull
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Rewrites every reference to a temp id inside a queued operation to the corresponding
 * server id once the create that owns the temp id has drained. Covers:
 *
 * - `UpdateX`/`DeleteX` operations whose own id is a temp id,
 * - `foodId`/`recipeId` inside queued `CreateEntry`/`UpdateEntry` bodies,
 * - ingredient `foodId`s inside queued recipe and supplement create/update bodies,
 * - `supplementId` in `Log`/`UnlogSupplement` operations.
 *
 * Returns an operation equal to [op] when nothing matched. Temp ids are random UUIDs,
 * so a flat tempId→serverId map cannot collide across entity types.
 */
internal fun remapTempIds(
    op: SyncOperation,
    remaps: Map<String, String>,
    json: Json,
): SyncOperation {
    if (remaps.isEmpty()) return op

    fun remap(id: String): String = remaps[id] ?: id
    return when (op) {
        is SyncOperation.UpdateFood -> {
            op.copy(id = remap(op.id))
        }

        is SyncOperation.DeleteFood -> {
            op.copy(id = remap(op.id))
        }

        is SyncOperation.ToggleFavorite -> {
            op.copy(id = remap(op.id))
        }

        is SyncOperation.SetFoodImage -> {
            op.copy(id = remap(op.id))
        }

        is SyncOperation.UpdateRecipe -> {
            op.copy(id = remap(op.id), body = remapRecipeUpdateBody(op.body, remaps, json))
        }

        is SyncOperation.DeleteRecipe -> {
            op.copy(id = remap(op.id))
        }

        is SyncOperation.UpdateSupplement -> {
            op.copy(id = remap(op.id), body = remapSupplementCreateBody(op.body, remaps, json))
        }

        is SyncOperation.DeleteSupplement -> {
            op.copy(id = remap(op.id))
        }

        is SyncOperation.LogSupplement -> {
            op.copy(supplementId = remap(op.supplementId))
        }

        is SyncOperation.UnlogSupplement -> {
            op.copy(supplementId = remap(op.supplementId))
        }

        is SyncOperation.CreateEntry -> {
            op.copy(body = remapEntryCreateBody(op.body, remaps, json))
        }

        is SyncOperation.UpdateEntry -> {
            op.copy(body = remapEntryUpdateBody(op.body, remaps, json))
        }

        is SyncOperation.CreateRecipe -> {
            op.copy(body = remapRecipeCreateBody(op.body, remaps, json))
        }

        is SyncOperation.CreateSupplement -> {
            op.copy(body = remapSupplementCreateBody(op.body, remaps, json))
        }

        else -> {
            op
        }
    }
}

private fun remapEntryCreateBody(
    body: String,
    remaps: Map<String, String>,
    json: Json,
): String {
    val entry = json.decodeOrNull<EntryCreate>(body) ?: return body
    val updated =
        entry.copy(
            foodId = entry.foodId?.let { remaps[it] ?: it },
            recipeId = entry.recipeId?.let { remaps[it] ?: it },
        )
    return if (updated == entry) body else json.encodeToString(updated)
}

private fun remapEntryUpdateBody(
    body: String,
    remaps: Map<String, String>,
    json: Json,
): String {
    val entry = json.decodeOrNull<EntryUpdate>(body) ?: return body
    val updated =
        entry.copy(
            foodId = entry.foodId?.let { remaps[it] ?: it },
            recipeId = entry.recipeId?.let { remaps[it] ?: it },
        )
    return if (updated == entry) body else json.encodeToString(updated)
}

private fun remapRecipeCreateBody(
    body: String,
    remaps: Map<String, String>,
    json: Json,
): String {
    val recipe = json.decodeOrNull<RecipeCreate>(body) ?: return body
    val updated =
        recipe.copy(
            ingredients = recipe.ingredients.map { it.copy(foodId = remaps[it.foodId] ?: it.foodId) },
        )
    return if (updated == recipe) body else json.encodeToString(updated)
}

private fun remapRecipeUpdateBody(
    body: String,
    remaps: Map<String, String>,
    json: Json,
): String {
    val recipe = json.decodeOrNull<RecipeUpdate>(body) ?: return body
    val updated =
        recipe.copy(
            ingredients = recipe.ingredients?.map { it.copy(foodId = remaps[it.foodId] ?: it.foodId) },
        )
    return if (updated == recipe) body else json.encodeToString(updated)
}

private fun remapSupplementCreateBody(
    body: String,
    remaps: Map<String, String>,
    json: Json,
): String {
    val supplement = json.decodeOrNull<SupplementCreate>(body) ?: return body
    val updated =
        supplement.copy(
            ingredients = supplement.ingredients.map { it.copy(foodId = it.foodId?.let { id -> remaps[id] ?: id }) },
        )
    return if (updated == supplement) body else json.encodeToString(updated)
}
