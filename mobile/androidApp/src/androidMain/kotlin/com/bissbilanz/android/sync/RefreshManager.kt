package com.bissbilanz.android.sync

import com.bissbilanz.ErrorReporter
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
    private val errorReporter: ErrorReporter,
) {
    suspend fun refreshAll(date: String = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()) {
        coroutineScope {
            launch { safeRefresh { entryRepo.refresh(date) } }
            launch { safeRefresh { foodRepo.refreshFoods() } }
            launch { safeRefresh { foodRepo.refreshFavorites() } }
            launch { safeRefresh { foodRepo.refreshRecentFoods() } }
            launch { safeRefresh { recipeRepo.refresh() } }
            launch { safeRefresh { goalsRepo.refresh() } }
            launch { safeRefresh { weightRepo.refresh() } }
            launch { safeRefresh { supplementRepo.refresh() } }
            launch { safeRefresh { prefsRepo.refresh() } }
        }
    }

    private suspend fun safeRefresh(block: suspend () -> Unit) {
        try {
            block()
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
        }
    }
}
