package com.bissbilanz.android

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.content.IntentCompat
import androidx.lifecycle.lifecycleScope
import com.bissbilanz.ErrorReporter
import com.bissbilanz.android.health.HealthImporter
import com.bissbilanz.android.navigation.IncomingPackageFiles
import com.bissbilanz.android.navigation.PendingLogConfirmation
import com.bissbilanz.android.navigation.PendingNavigation
import com.bissbilanz.android.navigation.PendingPackageImport
import com.bissbilanz.android.navigation.takeNavigateRoute
import com.bissbilanz.android.reminders.RescheduleGeneralRemindersWorker
import com.bissbilanz.android.reminders.RescheduleRemindersWorker
import com.bissbilanz.android.ui.AppLanguage
import com.bissbilanz.android.ui.BissbilanzApp
import com.bissbilanz.android.ui.components.mealTypeDisplayName
import com.bissbilanz.android.widget.AssistantFoodLogger
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.util.resolvedCalories
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.koin.android.ext.android.inject
import kotlin.math.roundToInt

class MainActivity : ComponentActivity() {
    private val authManager: AuthManager by inject()
    private val healthImporter: HealthImporter by inject()
    private val assistantFoodLogger: AssistantFoodLogger by inject()
    private val errorReporter: ErrorReporter by inject()
    private val appScope: CoroutineScope by inject()

    // Below API 33 the platform has no per-app language, so the in-app choice has to be
    // pushed into this activity's own resources before anything is inflated.
    override fun attachBaseContext(newBase: Context) {
        super.attachBaseContext(AppLanguage.wrap(newBase))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        // A restored activity (rotation, process death) gets its launch intent again; a shared file
        // it carried has been handled once already and its read grant may be gone. Reopening from
        // Recents after back finished the task (API 26-30) replays the same intent without saved
        // state, so it is flagged as launched from history instead.
        val fromHistory = (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0
        handleIntent(intent, isFreshLaunch = savedInstanceState == null && !fromHistory)
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
        RescheduleGeneralRemindersWorker.enqueue(this)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent, isFreshLaunch = true)
    }

    private fun handleIntent(
        intent: Intent,
        isFreshLaunch: Boolean,
    ) {
        if (intent.hasExtra(EXTRA_NAVIGATE_TO)) {
            intent.takeNavigateRoute(isFreshLaunch)?.let { PendingNavigation.request(it) }
            return
        }

        // "Log <food> with Bissbilanz": a published per-food shortcut carries the food's
        // id, the Assistant's fallback capability intent carries the raw spoken name.
        val foodId = intent.getStringExtra(EXTRA_FOOD_ID)
        val foodName = intent.getStringExtra(EXTRA_FOOD_NAME)
        if (foodId != null || foodName != null) {
            intent.removeExtra(EXTRA_FOOD_ID)
            intent.removeExtra(EXTRA_FOOD_NAME)
            // A restored activity gets the original intent back, extras and all: the food
            // was logged when it first arrived.
            if (isFreshLaunch) logFoodFromAssistant(foodId, foodName)
            return
        }

        val sharedFile = foodPackageUri(intent)
        if (sharedFile != null) {
            // Consumed now, so a recreated activity does not open the same file again.
            intent.data = null
            intent.removeExtra(Intent.EXTRA_STREAM)
            intent.clipData = null
            if (isFreshLaunch) openFoodPackage(sharedFile)
            return
        }

        val uri = intent.data ?: return
        if (uri.scheme == "bissbilanz" && uri.host == "oauth" && uri.path == "/callback") {
            val state = uri.getQueryParameter("state")
            if (!authManager.validateState(state)) {
                Log.w("MainActivity", "OAuth state validation failed, ignoring callback")
                return
            }
            // No code (e.g. error=access_denied): the attempt is over, drop its verifier.
            val code =
                uri.getQueryParameter("code") ?: run {
                    authManager.clearPendingLogin()
                    return
                }
            // Resolved here: this activity's context carries the in-app language below API 33.
            val failedMessage = getString(R.string.login_failed)
            // App-scoped so a rotation or a finished activity does not cancel the code exchange.
            appScope.launch(Dispatchers.IO) {
                if (!authManager.handleCallback(code)) {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(applicationContext, failedMessage, Toast.LENGTH_LONG).show()
                    }
                }
            }
        }
    }

    /**
     * A `.bissbilanz` file tapped in another app arrives as ACTION_VIEW (with the file as data) or,
     * when shared to Bissbilanz, as ACTION_SEND (with it as EXTRA_STREAM). Whether it really is a
     * food package is decided by its content, not by the name or type the sender reports.
     */
    private fun foodPackageUri(intent: Intent): Uri? =
        when (intent.action) {
            Intent.ACTION_SEND ->
                IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)
                    ?: intent.clipData
                        ?.takeIf { it.itemCount > 0 }
                        ?.getItemAt(0)
                        ?.uri
            Intent.ACTION_VIEW -> intent.data?.takeIf { it.scheme == "content" || it.scheme == "file" }
            else -> null
        }

    /**
     * Copies the file into the app cache and holds it for the import screen. Navigation waits until
     * the app is past sign-in / onboarding, so this only records the request.
     */
    private fun openFoodPackage(uri: Uri) {
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                PendingPackageImport.request(IncomingPackageFiles.copyToCache(this@MainActivity, uri))
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                errorReporter.captureException(e)
                PendingPackageImport.request(
                    PendingPackageImport.Request(IncomingPackageFiles.DEFAULT_NAME, null, PendingPackageImport.Problem.UNREADABLE),
                )
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
