package com.bissbilanz.android.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
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
 * `/api/entries` carries the resolved image flat on the row; `Entry.food`/`Entry.recipe`
 * are only filled in for entries this device created, so the cached food or recipe row
 * is the last fallback that makes thumbnails show up on a synced device too.
 *
 * The whole lookup is keyed on the entry it describes: `produceState` remembers its
 * state without keys, so a slot reused for another entry (a delete or an insert shifts
 * the list) would otherwise keep the previous entry's URL, which the short-circuit
 * below never overwrites.
 */
@Composable
fun rememberEntryImageUrl(entry: Entry): String? {
    val direct = entry.imageUrl ?: entry.food?.imageUrl ?: entry.recipe?.imageUrl
    return key(entry.id, direct, entry.foodId, entry.recipeId) {
        val foodRepo: FoodRepository = koinInject()
        val recipeRepo: RecipeRepository = koinInject()
        val imageUrl by produceState(initialValue = direct) {
            if (value != null) return@produceState
            value =
                withContext(Dispatchers.IO) {
                    entry.foodId?.let { foodRepo.getFoodCached(it)?.imageUrl }
                        ?: entry.recipeId?.let { recipeRepo.getRecipeCached(it)?.imageUrl }
                }
        }
        imageUrl
    }
}
