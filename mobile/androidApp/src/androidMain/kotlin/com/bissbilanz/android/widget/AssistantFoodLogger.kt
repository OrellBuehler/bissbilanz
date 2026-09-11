package com.bissbilanz.android.widget

import com.bissbilanz.model.Entry
import com.bissbilanz.model.EntryCreate
import com.bissbilanz.model.Food
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.repository.PreferencesRepository
import com.bissbilanz.util.mealForCurrentTime
import com.bissbilanz.util.resolveDefaultMeal
import kotlinx.coroutines.flow.first
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import kotlin.time.Clock

/**
 * Logs the food an Assistant utterance or a published "Log <food>" shortcut names —
 * the Android counterpart of iOS's headless `LogFoodIntent`/`EntryWriter`. 1 serving,
 * to the meal the user's favourite-meal timeframes (or, failing that, the time of
 * day) would pick, through the same [EntryRepository] path every other quick-log
 * surface uses, so it inherits the sync queue for free.
 */
class AssistantFoodLogger(
    private val foodRepository: FoodRepository,
    private val entryRepository: EntryRepository,
    private val preferencesRepository: PreferencesRepository,
) {
    sealed interface Result {
        data class Logged(
            val food: Food,
            val meal: String,
            val entry: Entry,
        ) : Result

        data class NoMatch(
            val query: String,
        ) : Result
    }

    /**
     * [foodId] resolves a published dynamic shortcut (a known food); [foodName]
     * resolves the Assistant's fallback capability intent (free-form speech). Exactly
     * one is expected to be non-null; if both are, [foodId] wins.
     */
    suspend fun log(
        foodId: String?,
        foodName: String?,
    ): Result {
        val food =
            foodId?.let { foodRepository.getFoodCached(it) }
                ?: foodName?.let { foodRepository.resolveByName(it) }
        if (food == null) {
            return Result.NoMatch(foodName ?: foodId.orEmpty())
        }

        val prefs = preferencesRepository.preferences().first()
        val meal = resolveDefaultMeal(prefs) ?: mealForCurrentTime()
        val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()
        val entry =
            entryRepository.createEntry(
                EntryCreate(foodId = food.id, mealType = meal, servings = 1.0, date = today),
                food = food,
            )
        return Result.Logged(food, meal, entry)
    }
}
