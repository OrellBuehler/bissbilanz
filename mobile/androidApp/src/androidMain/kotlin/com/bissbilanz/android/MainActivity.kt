package com.bissbilanz.android

import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.bissbilanz.android.ui.BissbilanzApp
import com.bissbilanz.auth.AuthManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import org.koin.android.ext.android.inject

class MainActivity : ComponentActivity() {
    private val authManager: AuthManager by inject()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        handleIntent(intent)
        setContent {
            BissbilanzApp()
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent) {
        val navigateTo = intent.getStringExtra(EXTRA_NAVIGATE_TO)
        if (navigateTo != null) {
            intent.removeExtra(EXTRA_NAVIGATE_TO)
            _navigationEvent.tryEmit(navigateTo)
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
            CoroutineScope(Dispatchers.IO).launch {
                authManager.handleCallback(code)
            }
        }
    }

    companion object {
        const val EXTRA_NAVIGATE_TO = "navigate_to"
        const val EXTRA_FOOD_ID = "food_id"
        private val _navigationEvent = MutableSharedFlow<String>(extraBufferCapacity = 1)
        val navigationEvent = _navigationEvent.asSharedFlow()
    }
}
