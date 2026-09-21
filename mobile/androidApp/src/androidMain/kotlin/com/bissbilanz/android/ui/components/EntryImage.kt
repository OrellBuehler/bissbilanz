package com.bissbilanz.android.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import com.bissbilanz.model.Entry
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.repository.RecipeRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.koin.compose.koinInject

/**
 * The image URL of the food or recipe a log entry points at, or null.
 *
 * `Entry.food`/`Entry.recipe` are only filled in for entries this device created —
 * `/api/entries` returns flat fields — so the cached food or recipe row is the
 * fallback that makes thumbnails show up on a synced device too.
 */
@Composable
fun rememberEntryImageUrl(entry: Entry): String? {
    val foodRepo: FoodRepository = koinInject()
    val recipeRepo: RecipeRepository = koinInject()
    val imageUrl by produceState(
        initialValue = entry.food?.imageUrl ?: entry.recipe?.imageUrl,
        entry.id,
        entry.foodId,
        entry.recipeId,
    ) {
        if (value != null) return@produceState
        value =
            withContext(Dispatchers.IO) {
                entry.foodId?.let { foodRepo.getFoodCached(it)?.imageUrl }
                    ?: entry.recipeId?.let { recipeRepo.getRecipeCached(it)?.imageUrl }
            }
    }
    return imageUrl
}
