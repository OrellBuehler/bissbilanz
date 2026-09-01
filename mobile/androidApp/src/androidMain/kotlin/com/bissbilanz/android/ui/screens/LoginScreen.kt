package com.bissbilanz.android.ui.screens

import android.content.Context
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bissbilanz.android.R
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.mode.AppMode
import com.bissbilanz.mode.AppModeManager

/** Providers offered on the login screen, in display order. */
val loginProviders =
    listOf(
        "infomaniak" to R.string.login_with_infomaniak,
        "google" to R.string.login_with_google,
        "apple" to R.string.login_with_apple,
    )

/**
 * Shown until /api/auth/providers answers (or when it fails): the providers
 * known to be configured in production. A failed fetch must never hide a
 * working sign-in button.
 */
val defaultEnabledProviders = listOf("infomaniak", "google")

/** The login buttons to show, in display order, given the server's enabled provider ids. */
fun visibleLoginProviders(enabled: List<String>): List<Pair<String, Int>> = loginProviders.filter { (id, _) -> id in enabled }

/** Opens the OIDC login page in a Custom Tab. Shared with the Settings "Sign in to sync" flow. */
fun launchLoginFlow(
    context: Context,
    authManager: AuthManager,
    provider: String = "infomaniak",
) {
    val state =
        java.util.UUID
            .randomUUID()
            .toString()
    val url = authManager.buildLoginUrl(state, provider)
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
    val enabledProviders by produceState(defaultEnabledProviders, authManager) {
        authManager.fetchLoginProviders()?.let { value = it }
    }

    Surface(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .windowInsetsPadding(WindowInsets.safeDrawing)
                    .padding(32.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = stringResource(R.string.app_name),
                style = MaterialTheme.typography.headlineLarge,
                color = MaterialTheme.colorScheme.primary,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = stringResource(R.string.login_tagline),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(48.dp))
            visibleLoginProviders(enabledProviders).forEachIndexed { index, (provider, labelRes) ->
                if (index == 0) {
                    Button(
                        onClick = { launchLoginFlow(context, authManager, provider) },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(stringResource(labelRes))
                    }
                } else {
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedButton(
                        onClick = { launchLoginFlow(context, authManager, provider) },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(stringResource(labelRes))
                    }
                }
            }
            if (showContinueWithoutAccount(mode)) {
                Spacer(modifier = Modifier.height(16.dp))
                OutlinedButton(
                    onClick = { appModeManager.setMode(AppMode.LOCAL) },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(stringResource(R.string.login_continue_without_account))
                }
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = stringResource(R.string.login_local_mode_description),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}
