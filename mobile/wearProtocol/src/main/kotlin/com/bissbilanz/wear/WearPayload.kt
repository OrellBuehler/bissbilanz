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

/** Today's calories for one meal, for the watch's per-meal breakdown page. */
@Serializable
data class WearMealTotal(
    /** Canonical meal-type key, e.g. "Breakfast" or a custom type. */
    val mealType: String,
    val calories: Double,
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
    /** Today's calories per meal, in the order the watch should list them. */
    val meals: List<WearMealTotal> = emptyList(),
    /** Meal-type keys the watch offers in its log picker; server-driven, so custom types appear. */
    val mealTypes: List<String> = emptyList(),
    val favorites: List<WearFoodRef> = emptyList(),
    /** Recently logged foods, most recent first. */
    val recents: List<WearFoodRef> = emptyList(),
    val weight: WearWeightInfo? = null,
    val sleep: WearSleepInfo? = null,
    /**
     * The phone app's own language ("en"/"de"), so the watch renders in the same
     * language as the phone rather than in the watch's system locale. Null on a
     * payload from an older phone build; the watch then keeps its system locale.
     */
    val localeCode: String? = null,
) {
    /**
     * Day-bound totals only hold for the day they were captured. Zero them when
     * rendered on a later day while keeping goals and reference data, mirroring
     * the iOS `resetIfStale`.
     */
    fun resetIfStale(today: String): WearState = if (date == today) this else copy(date = today, totals = WearMacros(), meals = emptyList())
}

/**
 * Watch → phone "log this food". The phone runs the real write through its repository.
 *
 * `requestId` is stamped once on the watch and kept across every retry of the same
 * request — the RPC → message fallback and the offline outbox both re-send the exact
 * bytes they were handed. Neither path can tell "the phone never got this" from "the
 * phone wrote it but the answer never came back", so the same log can arrive twice;
 * the phone drops a repeat rather than writing it again. Nullable so a request from
 * an older watch build still decodes — the phone applies an id-less request as before
 * rather than dropping it. The same holds for the weight and sleep requests below.
 */
@Serializable
data class WearLogRequest(
    val foodId: String? = null,
    val recipeId: String? = null,
    val mealType: String,
    val servings: Double,
    /** ISO day. */
    val date: String,
    val requestId: String? = null,
)

/** Watch → phone "log my weight". */
@Serializable
data class WearWeightLogRequest(
    val weightKg: Double,
    /** ISO day. */
    val date: String,
    val requestId: String? = null,
)

/** Watch → phone "log my sleep". */
@Serializable
data class WearSleepLogRequest(
    val durationMinutes: Int,
    /** 1–10 quality, matching the phone's scale. */
    val quality: Double,
    /** ISO day the sleep is attributed to. */
    val date: String,
    val requestId: String? = null,
)

/** Data Layer paths and keys shared by both sides. */
object WearPaths {
    /** Phone → watch DataItem carrying the encoded [WearState]. */
    const val STATE = "/bissbilanz/state"

    /**
     * Watch → phone messages.
     *
     * Sent as an RPC (`MessageClient.sendRequest`), whose response body is the
     * refreshed [WearState] JSON — that is what lets the watch's rings move the
     * moment a log lands instead of waiting for the phone's next DataItem push.
     * `sendMessage` remains the fallback for a phone build with no RPC service
     * registered; it has no response channel, so that path waits for the push.
     */
    const val LOG_FOOD = "/bissbilanz/log-food"
    const val LOG_WEIGHT = "/bissbilanz/log-weight"
    const val LOG_SLEEP = "/bissbilanz/log-sleep"

    /** Watch → phone: "send me the current state". */
    const val REQUEST_STATE = "/bissbilanz/request-state"

    /**
     * Capability the phone app advertises. The watch listens for it appearing so
     * it can flush anything it queued the moment the phone is reachable again,
     * rather than waiting for the user to open the app.
     */
    const val PHONE_CAPABILITY = "bissbilanz_phone"

    /** DataMap key holding the JSON payload. */
    const val KEY_PAYLOAD = "payload"

    /**
     * Bumped on every push so the Data Layer treats an otherwise identical state
     * as a change — DataItems are deduplicated by content.
     */
    const val KEY_UPDATED_AT = "updatedAt"
}
