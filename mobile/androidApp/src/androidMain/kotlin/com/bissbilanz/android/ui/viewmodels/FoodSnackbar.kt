package com.bissbilanz.android.ui.viewmodels

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource

/** A snackbar message from a food-logging view model, resolved to text in the UI. */
data class FoodSnackbar(
    @StringRes val messageRes: Int,
    val arg: String? = null,
)

@Composable
fun FoodSnackbar.text(): String = if (arg != null) stringResource(messageRes, arg) else stringResource(messageRes)
