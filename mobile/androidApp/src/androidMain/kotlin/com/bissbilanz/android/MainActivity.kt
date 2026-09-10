package com.bissbilanz.android

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.lifecycleScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.health.HealthImporter
import com.bissbilanz.android.navigation.PendingLogConfirmation
import com.bissbilanz.android.navigation.PendingNavigation
import com.bissbilanz.android.reminders.RescheduleRemindersWorker
import com.bissbilanz.android.ui.AppLanguage
import com.bissbilanz.android.ui.BissbilanzApp
import com.bissbilanz.android.ui.components.mealTypeDisplayName
import com.bissbilanz.android.widget.AssistantFoodLogger
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.util.resolvedCalories
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.koin.android.ext.android.inject
import kotlin.math.roundToInt

class MainActivity : ComponentActivity() {
    private val authManager: AuthManager by inject()
    private val healthImporter: HealthImporter by inject()
    private val assistantFoodLogger: AssistantFoodLogger by inject()
    private val errorReporter: ErrorReporter by inject()

    // Below API 33 the platform has no per-app language, so the in-app choice has to be
    // pushed into this activity's own resources before anything is inflated.
    override fun attachBaseContext(newBase: Context) {
        super.attachBaseContext(AppLanguage.wrap(newBase))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        handleIntent(intent)
        setContent {
            BissbilanzApp()
        }
    }

    /**
     * Health Connect import runs on every activation, matching iOS: new samples
     * from a scale or watch land in the app without a manual pull.
     */
    override fun onResume() {
        super.onResume()
        lifecycleScope.launch(Dispatchers.IO) {
            healthImporter.importAllIfEnabled()
        }
        // Safety net for the cases nothing else catches: a force-stop or an aggressive
        // OEM task-killer clears pending alarms silently, and there is no broadcast for
        // either. Re-arming on every activation is cheap and self-healing.
        RescheduleRemindersWorker.enqueue(this)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent) {
        val navigateTo = intent.getStringExtra(EXTRA_NAVIGATE_TO)
        if (navigateTo != null) {
            intent.removeExtra(EXTRA_NAVIGATE_TO)
            PendingNavigation.request(navigateTo)
            return
        }

        // "Log <food> with Bissbilanz": a published per-food shortcut carries the food's
        // id, the Assistant's fallback capability intent carries the raw spoken name.
        val foodId = intent.getStringExtra(EXTRA_FOOD_ID)
        val foodName = intent.getStringExtra(EXTRA_FOOD_NAME)
        if (foodId != null || foodName != null) {
            intent.removeExtra(EXTRA_FOOD_ID)
            intent.removeExtra(EXTRA_FOOD_NAME)
            logFoodFromAssistant(foodId, foodName)
            return
        }

        val uri = intent.data ?: return
        if (uri.scheme == "bissbilanz" && uri.host == "oauth" && uri.path == "/callback") {
            val state = uri.getQueryParameter("state")
            if (!authManager.validateState(state)) {
                Log.w("MainActivity", "OAuth state validation failed, ignoring callback")
                return
            }
            val code = uri.getQueryParameter("code") ?: return
            lifecycleScope.launch(Dispatchers.IO) {
                authManager.handleCallback(code)
            }
        }
    }

    /**
     * Android always launches the activity for an App Action — unlike iOS's headless
     * `LogFoodIntent` — so full silence isn't possible, but the entry still gets
     * written without any further tap. A match logs 1 serving to the default meal and
     * lands on today's day log with an undo-able confirmation; no match falls back to
     * food search prefilled with the query.
     */
    private fun logFoodFromAssistant(
        foodId: String?,
        foodName: String?,
    ) {
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                when (val result = assistantFoodLogger.log(foodId, foodName)) {
                    is AssistantFoodLogger.Result.Logged -> {
                        val message =
                            getString(
                                R.string.assistant_food_logged,
                                result.food.name,
                                mealTypeDisplayName(this@MainActivity, result.meal),
                                result.entry.resolvedCalories().roundToInt(),
                            )
                        PendingLogConfirmation.request(result.entry.id, message)
                        PendingNavigation.request("daylog/${result.entry.date}")
                    }

                    is AssistantFoodLogger.Result.NoMatch -> {
                        PendingNavigation.requestFoodSearch(result.query)
                    }
                }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                errorReporter.captureException(e)
            }
        }
    }

    companion object {
        const val EXTRA_NAVIGATE_TO = "navigate_to"
        const val EXTRA_FOOD_ID = "food_id"
        const val EXTRA_FOOD_NAME = "food_name"
    }
}
