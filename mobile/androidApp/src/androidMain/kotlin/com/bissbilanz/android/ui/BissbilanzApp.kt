package com.bissbilanz.android.ui

import android.util.Base64
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
import com.bissbilanz.android.ui.screens.MigrationScreen
import com.bissbilanz.android.ui.theme.BissbilanzTheme
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.auth.AuthState
import com.bissbilanz.mode.AppMode
import com.bissbilanz.mode.AppModeManager
import io.sentry.Sentry
import io.sentry.protocol.User
import org.json.JSONObject
import org.koin.compose.koinInject

/** Top-level destination shown at the app root, resolved from auth state and app mode. */
enum class RootDestination { Loading, Login, App, Migration }

/**
 * Pure routing decision: which root destination to show for the given [authState] and [mode].
 *
 * - Local mode is fully anonymous, so an unauthenticated user still sees the app.
 * - A successful login while in Local mode means the local data must be migrated to the
 *   account first, so the migration screen is shown.
 * - A `null` mode means "not chosen yet" and is treated as sync-allowed (existing
 *   installs and fresh logins).
 */
fun resolveRootDestination(
    authState: AuthState,
    mode: AppMode?,
): RootDestination =
    when (authState) {
        is AuthState.Loading -> {
            RootDestination.Loading
        }

        is AuthState.Authenticated, is AuthState.Refreshing -> {
            if (mode == AppMode.LOCAL) RootDestination.Migration else RootDestination.App
        }

        is AuthState.Unauthenticated, is AuthState.SessionExpired -> {
            if (mode == AppMode.LOCAL) RootDestination.App else RootDestination.Login
        }
    }

@Composable
fun BissbilanzApp() {
    val authManager: AuthManager = koinInject()
    val appModeManager: AppModeManager = koinInject()
    val authState by authManager.authState.collectAsStateWithLifecycle()
    val mode by appModeManager.mode.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) {
        authManager.initialize()
    }

    LaunchedEffect(authState) {
        if (authState is AuthState.Authenticated || authState is AuthState.Refreshing) {
            val token = authManager.getAccessToken()
            val userId = token?.let { extractSubFromJwt(it) }
            if (userId != null) {
                Sentry.setUser(User().apply { id = userId })
            }
        } else if (authState is AuthState.Unauthenticated || authState is AuthState.SessionExpired) {
            Sentry.setUser(null)
        }
    }

    // Existing installs and fresh logins that never chose a mode default to Synced.
    LaunchedEffect(authState, mode) {
        if ((authState is AuthState.Authenticated || authState is AuthState.Refreshing) && mode == null) {
            appModeManager.setMode(AppMode.SYNCED)
        }
    }

    val destination = resolveRootDestination(authState, mode)

    BissbilanzTheme {
        when (destination) {
            RootDestination.Loading -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator()
                }
            }

            RootDestination.Login -> {
                if (authState is AuthState.SessionExpired) {
                    val context = LocalContext.current
                    LaunchedEffect(Unit) {
                        Toast.makeText(context, "Session expired, please sign in again", Toast.LENGTH_LONG).show()
                        authManager.clearSessionExpired()
                    }
                }
                LoginScreen(authManager, appModeManager)
            }

            RootDestination.App -> {
                // In Local mode a stale SessionExpired is cleared silently — no toast,
                // the app works without an account.
                if (authState is AuthState.SessionExpired) {
                    LaunchedEffect(Unit) {
                        authManager.clearSessionExpired()
                    }
                }
                AppNavigation()
            }

            RootDestination.Migration -> {
                MigrationScreen()
            }
        }
    }
}

private fun extractSubFromJwt(token: String): String? =
    try {
        val parts = token.split(".")
        if (parts.size >= 2) {
            val payload = String(Base64.decode(parts[1], Base64.URL_SAFE or Base64.NO_PADDING))
            JSONObject(payload).optString("sub", null)
        } else {
            null
        }
    } catch (_: Exception) {
        null
    }
