package com.bissbilanz.android.ui.screens

import android.content.Context
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.mode.AppMode
import com.bissbilanz.mode.AppModeManager

/** Opens the OIDC login page in a Custom Tab. Shared with the Settings "Sign in to sync" flow. */
fun launchLoginFlow(
    context: Context,
    authManager: AuthManager,
) {
    val state =
        java.util.UUID
            .randomUUID()
            .toString()
    val url = authManager.buildLoginUrl(state)
    val customTabsIntent = CustomTabsIntent.Builder().build()
    customTabsIntent.launchUrl(context, Uri.parse(url))
}

/**
 * Whether the login screen may offer the anonymous "Continue without account" option.
 *
 * It is only for users who have not chosen a mode yet (`null`). A SYNCED user reaching
 * the login screen is the session-expired re-login case: offering Local mode there
 * would turn the leftover account cache into "local data" and duplicate everything on
 * the next sign-in.
 */
fun showContinueWithoutAccount(mode: AppMode?): Boolean = mode != AppMode.SYNCED

@Composable
fun LoginScreen(
    authManager: AuthManager,
    appModeManager: AppModeManager,
) {
    val context = LocalContext.current
    val mode by appModeManager.mode.collectAsStateWithLifecycle()

    Surface(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(32.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "Bissbilanz",
                style = MaterialTheme.typography.headlineLarge,
                color = MaterialTheme.colorScheme.primary,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Track your nutrition",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(48.dp))
            Button(
                onClick = { launchLoginFlow(context, authManager) },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Sign in")
            }
            if (showContinueWithoutAccount(mode)) {
                Spacer(modifier = Modifier.height(16.dp))
                OutlinedButton(
                    onClick = { appModeManager.setMode(AppMode.LOCAL) },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Continue without account")
                }
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Your data stays on this device. Sign in later anytime to sync.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}
