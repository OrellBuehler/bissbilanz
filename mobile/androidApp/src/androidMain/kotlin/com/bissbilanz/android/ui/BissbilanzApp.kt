package com.bissbilanz.android.ui

import android.widget.Toast
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bissbilanz.android.navigation.AppNavigation
import com.bissbilanz.android.ui.screens.LoginScreen
import com.bissbilanz.android.ui.theme.BissbilanzTheme
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.auth.AuthState
import org.koin.compose.koinInject

@Composable
fun BissbilanzApp() {
    val authManager: AuthManager = koinInject()
    val authState by authManager.authState.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) {
        authManager.initialize()
    }

    BissbilanzTheme {
        when (authState) {
            is AuthState.Loading -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator()
                }
            }
            is AuthState.SessionExpired -> {
                val context = LocalContext.current
                LaunchedEffect(Unit) {
                    Toast.makeText(context, "Session expired, please sign in again", Toast.LENGTH_LONG).show()
                    authManager.clearSessionExpired()
                }
                LoginScreen(authManager)
            }
            is AuthState.Unauthenticated -> LoginScreen(authManager)
            is AuthState.Authenticated, is AuthState.Refreshing -> AppNavigation()
        }
    }
}
