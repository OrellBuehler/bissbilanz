package com.bissbilanz.wear

import kotlinx.serialization.Serializable

// Wire types exchanged between the phone and a paired Wear OS watch over the
// Data Layer. Mirrors the iOS WatchConnectivityPayload.
//
// They live in their own module so the phone app and the watch app agree on the
// shape without the watch pulling in :shared. Everything the watch shows travels
// through here: a watch cannot read the phone's local database.

/** A loggable food/recipe reference shown in the watch's quick-log list. */
@Serializable
data class WearFoodRef(
    /** Server/local id of the underlying food or recipe. */
    val id: String,
    val name: String,
    /** Calories per serving. */
    val calories: Double,
    /** True when [id] is a recipe id rather than a food id. */
    val isRecipe: Boolean = false,
)

/** Latest weight plus a glanceable 7-day delta for the watch's weight tab. */
@Serializable
data class WearWeightInfo(
    val latestKg: Double? = null,
    val latestDate: String? = null,
    /** Latest weight minus the weight ~7 days earlier, in kg. Negative means lost. */
    val delta7dKg: Double? = null,
)

/** Last night's sleep for the watch's sleep tab. */
@Serializable
data class WearSleepInfo(
    /** ISO day the entry refers to. */
    val date: String,
    val durationMinutes: Int,
    /** 1–10, matching the phone's scale. */
    val quality: Double,
)

/** Today's macro totals and the goals they are measured against. */
@Serializable
data class WearMacros(
    val calories: Double = 0.0,
    val protein: Double = 0.0,
    val carbs: Double = 0.0,
    val fat: Double = 0.0,
    val fiber: Double = 0.0,
)

/** The full "today" state the phone mirrors to the watch. */
@Serializable
data class WearState(
    /** ISO day the totals were captured for; the watch zeroes them on a later day. */
    val date: String,
    val totals: WearMacros = WearMacros(),
    val goals: WearMacros = WearMacros(),
    /** Meal-type keys the watch offers in its log picker; server-driven, so custom types appear. */
    val mealTypes: List<String> = emptyList(),
    val favorites: List<WearFoodRef> = emptyList(),
    /** Recently logged foods, most recent first. */
    val recents: List<WearFoodRef> = emptyList(),
    val weight: WearWeightInfo? = null,
    val sleep: WearSleepInfo? = null,
) {
    /**
     * Day-bound totals only hold for the day they were captured. Zero them when
     * rendered on a later day while keeping goals and reference data, mirroring
     * the iOS `resetIfStale`.
     */
    fun resetIfStale(today: String): WearState = if (date == today) this else copy(date = today, totals = WearMacros())
}

/** Watch → phone "log this food". The phone runs the real write through its repository. */
@Serializable
data class WearLogRequest(
    val foodId: String? = null,
    val recipeId: String? = null,
    val mealType: String,
    val servings: Double,
    /** ISO day. */
    val date: String,
)

/** Watch → phone "log my weight". */
@Serializable
data class WearWeightLogRequest(
    val weightKg: Double,
    /** ISO day. */
    val date: String,
)

/** Watch → phone "log my sleep". */
@Serializable
data class WearSleepLogRequest(
    val durationMinutes: Int,
    /** 1–10 quality, matching the phone's scale. */
    val quality: Double,
    /** ISO day the sleep is attributed to. */
    val date: String,
)

/** Data Layer paths and keys shared by both sides. */
object WearPaths {
    /** Phone → watch DataItem carrying the encoded [WearState]. */
    const val STATE = "/bissbilanz/state"

    /** Watch → phone messages. */
    const val LOG_FOOD = "/bissbilanz/log-food"
    const val LOG_WEIGHT = "/bissbilanz/log-weight"
    const val LOG_SLEEP = "/bissbilanz/log-sleep"

    /** Watch → phone: "send me the current state". */
    const val REQUEST_STATE = "/bissbilanz/request-state"

    /** DataMap key holding the JSON payload. */
    const val KEY_PAYLOAD = "payload"

    /**
     * Bumped on every push so the Data Layer treats an otherwise identical state
     * as a change — DataItems are deduplicated by content.
     */
    const val KEY_UPDATED_AT = "updatedAt"
}
