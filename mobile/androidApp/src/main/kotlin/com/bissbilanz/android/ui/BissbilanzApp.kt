package com.bissbilanz.android.ui

import androidx.compose.runtime.*
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
            is AuthState.Unauthenticated -> LoginScreen(authManager)
            is AuthState.Authenticated, is AuthState.Refreshing -> AppNavigation()
        }
    }
}
