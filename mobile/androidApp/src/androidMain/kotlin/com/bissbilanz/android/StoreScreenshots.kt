package com.bissbilanz.android

import android.content.Context
import android.content.Intent
import android.util.Log
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.navigation.NavTabPrefs
import com.bissbilanz.android.navigation.PendingNavigation
import com.bissbilanz.android.tips.TipIds
import com.bissbilanz.android.tips.TipStore
import com.bissbilanz.mode.AppMode
import com.bissbilanz.mode.AppModeManager
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.koin.java.KoinJavaComponent

/**
 * Debug-only launch mode for the Play Store screenshots
 * (`scripts/android/store-screenshots.sh`, workflow `store-screenshots-android.yml`).
 *
 * `am start -n .../.MainActivity --es store_screenshot <screen>` makes a debug build run
 * in Local mode on invented demo data ([StoreScreenshotSeed]), so no real diary ever ends
 * up in a screenshot: the first launch fills the throwaway emulator database, later
 * launches reuse it. Every entry point is behind `BuildConfig.DEBUG`, a compile-time
 * constant, so release builds drop the whole thing.
 *
 * Language and appearance are not handled here: the script writes the app's own language
 * preference before the launch and flips the emulator's night mode.
 *
 * Screens: `home`, `log-food`, `foods`, `favorites`, `insights` (with
 * `--es store_screenshot_insights_tab overview|nutrition|weight|sleep`), `weight`,
 * `log-food` (with `--es store_screenshot_query <text>` typed into the search field),
 * `sleep`, `calendar`, `recipes`, `recipe`, `recipe-bowl`, `nutrients`, `settings`.
 */
object StoreScreenshots {
    const val EXTRA_SCREEN = "store_screenshot"
    const val EXTRA_INSIGHTS_TAB = "store_screenshot_insights_tab"
    const val EXTRA_QUERY = "store_screenshot_query"
    const val TAG = "StoreScreenshots"

    private const val PREFS = "store_screenshots"
    private const val KEY_SEEDED = "seeded"
    private const val KEY_SALMON = "salmon_food_id"
    private const val KEY_OATS = "oats_recipe_id"
    private const val KEY_BOWL = "bowl_recipe_id"

    private val insightsTabs = listOf("overview", "nutrition", "weight", "sleep")

    private val _addFoodMeal = MutableStateFlow<String?>(null)

    /** The meal the dashboard should open its add-food sheet for, once. */
    val addFoodMeal: StateFlow<String?> = _addFoodMeal.asStateFlow()

    fun consumeAddFoodMeal() {
        _addFoodMeal.value = null
    }

    private val _searchQuery = MutableStateFlow<String?>(null)

    /** What the add-food sheet should have typed into its search field, once. */
    val searchQuery: StateFlow<String?> = _searchQuery.asStateFlow()

    fun consumeSearchQuery() {
        _searchQuery.value = null
    }

    @Volatile
    private var insightsTab: Int? = null

    /** The Insights tab to open on, claimed once by the Insights view model. */
    fun takeInsightsTab(): Int? = insightsTab.also { insightsTab = null }

    fun isRequested(intent: Intent): Boolean = BuildConfig.DEBUG && intent.hasExtra(EXTRA_SCREEN)

    /**
     * Synchronous, before the UI is composed: Local mode (no login screen), no tips or
     * hints, and a bottom bar of Foods, Insights and Weight like the iOS captures.
     */
    fun prepare(context: Context) {
        if (!BuildConfig.DEBUG) return
        val koin = KoinJavaComponent.getKoin()
        koin.get<AppModeManager>().setMode(AppMode.LOCAL)
        val tipStore = koin.get<TipStore>()
        listOf(
            TipIds.DASHBOARD_LAYOUT,
            TipIds.SCANNING,
            TipIds.FAVORITES,
            TipIds.WIDGETS,
            TipIds.HEALTH_CONNECT_WEIGHT,
            TipIds.HEALTH_CONNECT_SLEEP,
        ).forEach(tipStore::dismiss)
        NavTabPrefs(context).setTabs(listOf("foods", "insights", "weight"))
    }

    /** Seeds on the first launch, then opens the requested screen. Logs `ready` when done. */
    fun start(
        context: Context,
        intent: Intent,
    ) {
        if (!BuildConfig.DEBUG) return
        val screen = intent.getStringExtra(EXTRA_SCREEN).orEmpty()
        val insightsTabName = intent.getStringExtra(EXTRA_INSIGHTS_TAB)
        val query = intent.getStringExtra(EXTRA_QUERY)
        val german =
            context.resources.configuration.locales[0]
                .language == "de"
        val koin = KoinJavaComponent.getKoin()
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        koin.get<CoroutineScope>().launch {
            try {
                if (!prefs.getBoolean(KEY_SEEDED, false)) {
                    val ids = StoreScreenshotSeed.seed(koin, german)
                    prefs
                        .edit()
                        .putString(KEY_SALMON, ids.salmonFoodId)
                        .putString(KEY_OATS, ids.oatsRecipeId)
                        .putString(KEY_BOWL, ids.bowlRecipeId)
                        .putBoolean(KEY_SEEDED, true)
                        .commit()
                    Log.i(TAG, "seeded")
                }
                insightsTab = insightsTabName?.let { insightsTabs.indexOf(it) }?.takeIf { it >= 0 }
                when (screen) {
                    "log-food" -> {
                        _searchQuery.value = query
                        _addFoodMeal.value = "Dinner"
                    }
                    "nutrients" -> PendingNavigation.request("food/${prefs.getString(KEY_SALMON, null)}")
                    "recipe" -> PendingNavigation.request("recipe/${prefs.getString(KEY_OATS, null)}")
                    "recipe-bowl" -> PendingNavigation.request("recipe/${prefs.getString(KEY_BOWL, null)}")
                    "", "home" -> Unit
                    else -> PendingNavigation.request(screen)
                }
                Log.i(TAG, "ready $screen")
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                Log.e(TAG, "failed $screen", e)
                koin.get<ErrorReporter>().captureException(e)
            }
        }
    }
}
