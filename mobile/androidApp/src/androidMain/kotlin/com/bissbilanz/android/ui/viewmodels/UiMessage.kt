package com.bissbilanz.android.ui.viewmodels

import androidx.annotation.StringRes
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.res.stringResource

/** A localized message from a view model, resolved to text by the screen. */
data class UiMessage(
    @StringRes val res: Int,
    val args: List<Any> = emptyList(),
)

@Composable
fun UiMessage.text(): String = if (args.isEmpty()) stringResource(res) else stringResource(res, *args.toTypedArray())

/**
 * Shows [message] as a snackbar and calls [onShown] once it is gone, so the view model can clear it.
 * The text is resolved in composition: a Context read inside the effect is not
 * configuration-aware, so an app-language change would show the previous locale's text.
 */
@Composable
fun UiMessageSnackbar(
    message: UiMessage?,
    snackbarHostState: SnackbarHostState,
    onShown: () -> Unit,
) {
    val text = message?.text()
    LaunchedEffect(message) {
        if (text != null) {
            snackbarHostState.showSnackbar(text)
            onShown()
        }
    }
}
