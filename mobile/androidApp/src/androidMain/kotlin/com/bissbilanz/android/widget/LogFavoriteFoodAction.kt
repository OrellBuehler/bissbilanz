package com.bissbilanz.android.widget

import android.content.Context
import android.content.Intent
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.action.ActionCallback
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.MainActivity
import com.bissbilanz.model.EntryCreate
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.userdata.UserDataDatabase
import com.bissbilanz.util.decodeOrNull
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
        val foodName = parameters[FoodNameKey] ?: ""

        val koin =
            org.koin.java.KoinJavaComponent
                .getKoin()
        val entryRepo = koin.get<EntryRepository>()
        val db = koin.get<UserDataDatabase>()
        val json = koin.get<Json>()
        val errorReporter = koin.get<ErrorReporter>()

        val cached = db.userDataDatabaseQueries.selectPreferences().executeAsOneOrNull()
        val prefs = cached?.let { json.decodeOrNull<com.bissbilanz.api.generated.model.Preferences>(it.jsonData) }
        val meal = resolveDefaultMeal(prefs)

        if (meal != null) {
            try {
                val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toString()
                val entry = EntryCreate(foodId = foodId, mealType = meal, servings = 1.0, date = today)
                entryRepo.createEntry(entry)

                markLogged(foodId)
                FavoritesWidget.updateAllWidgets(context)

                delay(1200)

                clearLogged(foodId)
                FavoritesWidget.updateAllWidgets(context)

                MacroWidget.updateAllWidgets(context)
            } catch (e: Exception) {
                if (e is kotlinx.coroutines.CancellationException) throw e
                errorReporter.captureException(e)
            }
        } else {
            val intent =
                Intent(context, MainActivity::class.java).apply {
                    putExtra(MainActivity.EXTRA_NAVIGATE_TO, "favorites")
                    putExtra(MainActivity.EXTRA_FOOD_ID, foodId)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                }
            context.startActivity(intent)
        }
    }

    companion object {
        // Per-food "just logged ✓" markers. A single shared field was clobbered
        // when two favorites were logged within the checkmark window, so the wrong
        // tile (or none) showed the checkmark.
        private val recentlyLogged: MutableSet<String> =
            java.util.concurrent.ConcurrentHashMap
                .newKeySet()

        fun isRecentlyLogged(foodId: String): Boolean = recentlyLogged.contains(foodId)

        internal fun markLogged(foodId: String) {
            recentlyLogged.add(foodId)
        }

        internal fun clearLogged(foodId: String) {
            recentlyLogged.remove(foodId)
        }
    }
}
