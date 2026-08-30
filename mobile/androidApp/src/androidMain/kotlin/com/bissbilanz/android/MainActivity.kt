package com.bissbilanz.android

import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.lifecycleScope
import com.bissbilanz.android.health.HealthImporter
import com.bissbilanz.android.navigation.PendingNavigation
import com.bissbilanz.android.reminders.RescheduleRemindersWorker
import com.bissbilanz.android.ui.BissbilanzApp
import com.bissbilanz.auth.AuthManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.koin.android.ext.android.inject

class MainActivity : ComponentActivity() {
    private val authManager: AuthManager by inject()
    private val healthImporter: HealthImporter by inject()

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

    companion object {
        const val EXTRA_NAVIGATE_TO = "navigate_to"
        const val EXTRA_FOOD_ID = "food_id"
    }
}
