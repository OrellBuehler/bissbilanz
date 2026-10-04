package com.bissbilanz.android.widget

import android.content.Context
import android.content.Intent
import com.bissbilanz.android.MainActivity
import com.bissbilanz.api.generated.model.Preferences
import com.bissbilanz.userdata.UserDataDatabase
import com.bissbilanz.util.decodeOrNull
import kotlinx.serialization.json.Json

object WidgetRoutes {
    const val SCANNER = "scanner"
    const val FOODS = "foods"
    const val FAVORITES = "favorites"
}

/**
 * The intent for a widget tap that opens the app on [route].
 *
 * It must be handed to Glance's `actionStartActivity`, which turns it into a
 * PendingIntent the launcher fires on the user's tap. Starting the same intent from an
 * `ActionCallback` instead does not work: a callback runs in a broadcast receiver with
 * no visible window, which Android's background-activity-start rules silently block.
 */
fun openAppIntent(
    context: Context,
    route: String,
): Intent =
    Intent(context, MainActivity::class.java).apply {
        putExtra(MainActivity.EXTRA_NAVIGATE_TO, route)
    }

/**
 * Whether a tap on a quick-log tile can never log on its own, going by the cached
 * preferences: no meal is ever picked for the user, so the tap has to open the app.
 * Decided when the widget renders because the app can only be opened from a real
 * click action, not from the callback that would otherwise log the food.
 */
internal fun tilesAlwaysAskForMeal(
    db: UserDataDatabase,
    json: Json,
): Boolean {
    val cached = db.userDataDatabaseQueries.selectPreferences().executeAsOneOrNull()
    val prefs = cached?.let { json.decodeOrNull<Preferences>(it.jsonData) }
    return prefs == null || prefs.favoriteMealAssignmentMode == "ask_meal"
}
