package com.bissbilanz.android.widget

import android.content.Context
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.action.ActionCallback
import com.bissbilanz.ErrorReporter
import com.bissbilanz.model.EntryCreate
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.FoodRepository
import com.bissbilanz.userdata.UserDataDatabase
import com.bissbilanz.util.decodeOrNull
import com.bissbilanz.util.mealForCurrentTime
import com.bissbilanz.util.resolveDefaultMeal
import kotlinx.coroutines.delay
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import kotlinx.serialization.json.Json
import kotlin.time.Clock

val FoodIdKey = ActionParameters.Key<String>("food_id")
val FoodNameKey = ActionParameters.Key<String>("food_name")

class LogFavoriteFoodAction : ActionCallback {
    override suspend fun onAction(
        context: Context,
        glanceId: GlanceId,
        parameters: ActionParameters,
    ) {
        val foodId = parameters[FoodIdKey] ?: return

        val koin =
            org.koin.java.KoinJavaComponent
                .getKoin()
        val db = koin.get<UserDataDatabase>()
        val json = koin.get<Json>()
        val errorReporter = koin.get<ErrorReporter>()

        // A tile drawn before a sign-out or a switch to "ask for meal" still carries
        // this callback. Neither may log, and a callback cannot open the app, so the
        // redraw is what turns the tile into the signed-out state or an app launch.
        val cached = db.userDataDatabaseQueries.selectPreferences().executeAsOneOrNull()
        val prefs = cached?.let { json.decodeOrNull<com.bissbilanz.api.generated.model.Preferences>(it.jsonData) }
        if (!widgetsSignedIn() || prefs == null || prefs.favoriteMealAssignmentMode == "ask_meal") {
            showConfirmation(context)
            return
        }

        // Claimed before the write so a second tap inside the checkmark window is
        // dropped instead of logging the food twice.
        if (!markLogged(foodId)) return

        try {
            val meal = resolveDefaultMeal(prefs) ?: mealForCurrentTime()
            val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()
            val food = koin.get<FoodRepository>().getFoodCached(foodId)
            // The day widgets and the food shortcuts are redrawn by the app's
            // onEntryChanged hook, which createEntry fires.
            koin.get<EntryRepository>().createEntry(
                EntryCreate(foodId = foodId, mealType = meal, servings = 1.0, date = today),
                food = food,
            )

            showConfirmation(context)
            delay(1200)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
        } finally {
            clearLogged(foodId)
            showConfirmation(context)
        }
    }

    /** Both quick-log surfaces draw the "just logged ✓" state, so both have to redraw. */
    private suspend fun showConfirmation(context: Context) {
        FavoritesWidget.updateAllWidgets(context)
        QuickAddWidget.updateAllWidgets(context)
    }

    companion object {
        // Per-food "just logged ✓" markers. A single shared field was clobbered
        // when two favorites were logged within the checkmark window, so the wrong
        // tile (or none) showed the checkmark.
        private val recentlyLogged: MutableSet<String> =
            java.util.concurrent.ConcurrentHashMap
                .newKeySet()

        fun isRecentlyLogged(foodId: String): Boolean = recentlyLogged.contains(foodId)

        /** False when the food is already marked, i.e. a log for it is still in flight. */
        internal fun markLogged(foodId: String): Boolean = recentlyLogged.add(foodId)

        internal fun clearLogged(foodId: String) {
            recentlyLogged.remove(foodId)
        }
    }
}
