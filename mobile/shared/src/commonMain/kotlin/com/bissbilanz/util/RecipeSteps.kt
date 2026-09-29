package com.bissbilanz.util

import com.bissbilanz.api.generated.model.RecipeStepInput

/** Server limits for a recipe's cooking steps (`MAX_RECIPE_STEPS` / `MAX_RECIPE_STEP_TEXT`). */
const val MAX_RECIPE_STEPS = 50
const val MAX_RECIPE_STEP_TEXT = 2000

/** A step as the editor holds it: [key] keeps its widgets stable while the list is reordered. */
data class RecipeStepDraft(
    val key: String,
    val text: String = "",
    val imageUrl: String? = null,
)

/** Moves the item at [index] one place up ([direction] -1) or down (1); out-of-range moves change nothing. */
fun <T> List<T>.moved(
    index: Int,
    direction: Int,
): List<T> {
    val target = index + direction
    if (index !in indices || target !in indices) return this
    return toMutableList().also { list ->
        val item = list[index]
        list[index] = list[target]
        list[target] = item
    }
}

/** Trims each text, drops steps left blank and caps the list at the server limit. */
fun List<RecipeStepDraft>.toStepInputs(): List<RecipeStepInput> =
    map { it.copy(text = it.text.trim().take(MAX_RECIPE_STEP_TEXT)) }
        .filter { it.text.isNotEmpty() }
        .take(MAX_RECIPE_STEPS)
        .map { RecipeStepInput(text = it.text, imageUrl = it.imageUrl) }
