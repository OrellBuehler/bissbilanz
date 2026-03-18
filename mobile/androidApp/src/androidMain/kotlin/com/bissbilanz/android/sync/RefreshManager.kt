package com.bissbilanz.android.sync

import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.repository.GoalsRepository
import com.bissbilanz.repository.PreferencesRepository
import com.bissbilanz.repository.RecipeRepository
import com.bissbilanz.repository.SupplementRepository
import com.bissbilanz.repository.WeightRepository
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn

class RefreshManager(
    private val foodRepo: FoodRepository,
    private val entryRepo: EntryRepository,
    private val recipeRepo: RecipeRepository,
    private val goalsRepo: GoalsRepository,
    private val weightRepo: WeightRepository,
    private val supplementRepo: SupplementRepository,
    private val prefsRepo: PreferencesRepository,
) {
    suspend fun refreshAll(date: String = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()) {
        coroutineScope {
            launch { runCatching { entryRepo.refresh(date) } }
            launch { runCatching { foodRepo.refreshFoods() } }
            launch { runCatching { foodRepo.refreshFavorites() } }
            launch { runCatching { foodRepo.refreshRecentFoods() } }
            launch { runCatching { recipeRepo.refresh() } }
            launch { runCatching { goalsRepo.refresh() } }
            launch { runCatching { weightRepo.refresh() } }
            launch { runCatching { supplementRepo.refresh() } }
            launch { runCatching { prefsRepo.refresh() } }
        }
    }
}
