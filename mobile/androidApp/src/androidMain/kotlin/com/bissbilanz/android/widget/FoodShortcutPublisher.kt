package com.bissbilanz.android.widget

import android.content.Context
import android.content.Intent
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.MainActivity
import com.bissbilanz.android.R
import com.bissbilanz.userdata.UserDataDatabase
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import kotlinx.serialization.json.Json
import kotlin.time.Clock

/**
 * The Android half of what iOS gets from `IntentDonations`: the foods this device
 * logs most often, published as dynamic shortcuts so the launcher's long-press menu
 * and the Assistant can offer them by name.
 *
 * Each shortcut carries the same `navigate_to` extra the static shortcuts use, so it
 * lands on the food's detail screen through [MainActivity] and `PendingNavigation`
 * even on a cold start. The capability binding is what makes "Log <food> with
 * Bissbilanz" resolve — it supplies the inline inventory for the
 * `actions.intent.RECORD_FOOD_OBSERVATION` capability declared in
 * `res/xml/shortcuts.xml`.
 */
object FoodShortcutPublisher {
    const val FOOD_CAPABILITY = "actions.intent.RECORD_FOOD_OBSERVATION"
    const val FOOD_PARAMETER = "foodObservation.aboutFood.name"

    /** The `<shortcut>` entries shipped in `res/xml/shortcuts.xml`; they share the budget. */
    private const val STATIC_SHORTCUT_COUNT = 4
    private const val MAX_DYNAMIC_SHORTCUTS = 4
    private const val SHORT_LABEL_MAX_CHARS = 20

    suspend fun publish(context: Context) {
        val koin =
            org.koin.java.KoinJavaComponent
                .getKoin()
        val errorReporter = koin.get<ErrorReporter>()

        try {
            val db = koin.get<UserDataDatabase>()
            val json = koin.get<Json>()

            // A 30-day scan of the entry cache and a ShortcutManager round trip, and
            // the callers are repository hooks that can fire from the main thread.
            withContext(Dispatchers.IO) {
                val capacity =
                    (ShortcutManagerCompat.getMaxShortcutCountPerActivity(context) - STATIC_SHORTCUT_COUNT)
                        .coerceIn(0, MAX_DYNAMIC_SHORTCUTS)
                val shortcuts =
                    if (capacity == 0) {
                        emptyList<ShortcutInfoCompat>()
                    } else {
                        val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
                        RecentFoods
                            .load(db, json, today, capacity)
                            .filter { it.name.isNotBlank() }
                            .mapIndexed { index, food -> shortcutFor(context, food, index) }
                    }
                ShortcutManagerCompat.setDynamicShortcuts(context, shortcuts)
            }
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            errorReporter.captureException(e)
        }
    }

    internal fun shortcutId(foodId: String): String = "food_$foodId"

    private fun shortcutFor(
        context: Context,
        food: RecentFood,
        rank: Int,
    ): ShortcutInfoCompat {
        val intent =
            Intent(context, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                putExtra(MainActivity.EXTRA_NAVIGATE_TO, "food/${food.id}")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
        return ShortcutInfoCompat
            .Builder(context, shortcutId(food.id))
            .setShortLabel(food.name.take(SHORT_LABEL_MAX_CHARS))
            .setLongLabel(context.getString(R.string.quick_add_widget_log, food.name))
            .setIcon(IconCompat.createWithResource(context, R.mipmap.ic_launcher))
            .setIntent(intent)
            .setRank(rank)
            // Long-lived so the Assistant may keep offering the shortcut after it
            // drops off the list, rather than resolving to nothing.
            .setLongLived(true)
            .addCapabilityBinding(FOOD_CAPABILITY, FOOD_PARAMETER, listOf(food.name))
            .build()
    }
}
