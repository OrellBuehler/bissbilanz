package com.bissbilanz.android.wear

import android.content.Context
import com.bissbilanz.ErrorReporter
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.repository.GoalsRepository
import com.bissbilanz.repository.SleepRepository
import com.bissbilanz.repository.WeightRepository
import com.bissbilanz.util.DefaultGoals
import com.bissbilanz.util.mealTypes
import com.bissbilanz.util.normalizeMealType
import com.bissbilanz.util.resolvedCalories
import com.bissbilanz.util.resolvedCarbs
import com.bissbilanz.util.resolvedFat
import com.bissbilanz.util.resolvedFiber
import com.bissbilanz.util.resolvedProtein
import com.bissbilanz.wear.WearFoodRef
import com.bissbilanz.wear.WearMacros
import com.bissbilanz.wear.WearPaths
import com.bissbilanz.wear.WearSleepInfo
import com.bissbilanz.wear.WearState
import com.bissbilanz.wear.WearWeightInfo
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.tasks.await
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import kotlinx.serialization.json.Json
import kotlin.math.abs
import kotlin.time.Clock

/**
 * True when the failure is Play services saying it has no Wearable API — the normal
 * state of a phone that never supported Wear, not something to report. The cause chain
 * is walked because the Data Layer wraps the [ApiException] before it reaches us.
 *
 * The code to match is [CommonStatusCodes.API_NOT_CONNECTED] (17). The message reads
 * "statusCode=API_UNAVAILABLE", but that is the nested `ConnectionResult`'s label —
 * there is no `API_UNAVAILABLE` on [CommonStatusCodes] to compare against.
 */
internal fun Throwable.isWearableApiUnavailable(): Boolean {
    var current: Throwable? = this
    while (current != null) {
        if (current is ApiException && current.statusCode == CommonStatusCodes.API_NOT_CONNECTED) return true
        current = current.cause
    }
    return false
}

/**
 * Builds the watch's view of today and pushes it over the Data Layer.
 *
 * The watch has no account, database or network of its own, so everything it
 * renders is assembled here from the phone's local repositories — which also
 * means it keeps working offline and in local mode.
 */
class WearStatePublisher(
    private val context: Context,
    private val entryRepository: EntryRepository,
    private val goalsRepository: GoalsRepository,
    private val foodRepository: FoodRepository,
    private val weightRepository: WeightRepository,
    private val sleepRepository: SleepRepository,
    private val errorReporter: ErrorReporter,
) {
    private val json = Json { ignoreUnknownKeys = true }

    /**
     * Set once the Data Layer reports API_NOT_CONNECTED — a phone whose Play services
     * has no Wearable module, where every publish is doomed. `publish()` runs on each
     * entry change, so without this latch such a device rebuilds the whole day's state
     * from six repositories and then reports an expected failure, over and over.
     *
     * Deliberately process-scoped rather than persisted: installing the Wear OS
     * companion app makes the API appear, and a restart is enough to pick it up.
     */
    @Volatile
    private var wearableUnavailable = false

    suspend fun publish() {
        if (wearableUnavailable) return
        try {
            val state = buildState()
            val request =
                PutDataMapRequest.create(WearPaths.STATE).apply {
                    dataMap.putString(WearPaths.KEY_PAYLOAD, json.encodeToString(state))
                    // DataItems are deduplicated by content; without a changing
                    // field an identical re-push would never reach the watch.
                    dataMap.putLong(WearPaths.KEY_UPDATED_AT, Clock.System.now().toEpochMilliseconds())
                }
            Wearable
                .getDataClient(context)
                .putDataItem(request.asPutDataRequest().setUrgent())
                .await()
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            if (e.isWearableApiUnavailable()) {
                wearableUnavailable = true
                return
            }
            errorReporter.captureException(e)
        }
    }

    private suspend fun buildState(): WearState {
        val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
        val todayString = today.toString()
        val entries = entryRepository.entriesByDate(todayString).first()
        val goals = goalsRepository.goals().first()
        val favorites = foodRepository.favorites().first()
        val recents = foodRepository.recentFoods.value
        val weights = weightRepository.entries().first()
        val sleep = sleepRepository.entries().first().maxByOrNull { it.entryDate }

        return WearState(
            date = todayString,
            totals =
                WearMacros(
                    calories = entries.sumOf { it.resolvedCalories() },
                    protein = entries.sumOf { it.resolvedProtein() },
                    carbs = entries.sumOf { it.resolvedCarbs() },
                    fat = entries.sumOf { it.resolvedFat() },
                    fiber = entries.sumOf { it.resolvedFiber() },
                ),
            goals =
                WearMacros(
                    calories = goals?.calorieGoal ?: DefaultGoals.CALORIES,
                    protein = goals?.proteinGoal ?: DefaultGoals.PROTEIN,
                    carbs = goals?.carbGoal ?: DefaultGoals.CARBS,
                    fat = goals?.fatGoal ?: DefaultGoals.FAT,
                    fiber = goals?.fiberGoal ?: DefaultGoals.FIBER,
                ),
            // Learned from the synced log rather than hardcoded, so custom meal
            // types reach the watch too.
            mealTypes = (mealTypes + entries.map { normalizeMealType(it.mealType) }).distinct(),
            favorites = favorites.take(FAVORITES_LIMIT).map { it.toRef() },
            recents = recents.take(RECENTS_LIMIT).map { it.toRef() },
            weight = weights.toWeightInfo(today),
            sleep =
                sleep?.let {
                    WearSleepInfo(
                        date = it.entryDate,
                        durationMinutes = it.durationMinutes,
                        quality = it.quality,
                    )
                },
        )
    }

    private companion object {
        const val FAVORITES_LIMIT = 20
        const val RECENTS_LIMIT = 10

        /** How far back the 7-day delta looks for a comparison weight. */
        const val DELTA_WINDOW_DAYS = 7
        const val DELTA_TOLERANCE_DAYS = 3
    }

    private fun com.bissbilanz.model.Food.toRef() = WearFoodRef(id = id, name = name, calories = calories, isRecipe = false)

    /**
     * Latest weight plus a 7-day delta. The comparison entry is the one closest to
     * seven days back within a few days' tolerance — daily weigh-ins are not
     * guaranteed, and an exact-date lookup would usually find nothing.
     */
    private fun List<com.bissbilanz.model.WeightEntry>.toWeightInfo(today: LocalDate): WearWeightInfo? {
        val latest = maxByOrNull { it.entryDate } ?: return null
        val targetEpoch = today.toEpochDays() - DELTA_WINDOW_DAYS
        val comparison =
            mapNotNull { entry ->
                runCatching { LocalDate.parse(entry.entryDate) }.getOrNull()?.let { entry to it }
            }.filter { (_, date) -> abs(date.toEpochDays() - targetEpoch) <= DELTA_TOLERANCE_DAYS }
                .minByOrNull { (_, date) -> abs(date.toEpochDays() - targetEpoch) }
                ?.first

        return WearWeightInfo(
            latestKg = latest.weightKg,
            latestDate = latest.entryDate,
            delta7dKg = comparison?.let { latest.weightKg - it.weightKg },
        )
    }
}
