package com.bissbilanz.android

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.android.ui.BissbilanzApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
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
        val uri = intent.data ?: return
        if (uri.scheme == "bissbilanz" && uri.host == "oauth" && uri.path == "/callback") {
            val code = uri.getQueryParameter("code") ?: return
            CoroutineScope(Dispatchers.IO).launch {
                authManager.handleCallback(code)
            }
        }
    }
}
