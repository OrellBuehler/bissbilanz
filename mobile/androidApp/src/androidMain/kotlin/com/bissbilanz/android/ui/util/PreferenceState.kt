package com.bissbilanz.android.ui.util

import android.content.SharedPreferences
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState

/** [read] from [prefs], read again whenever anything in that file changes. */
@Composable
fun <T> rememberPreference(
    prefs: SharedPreferences,
    read: () -> T,
): State<T> {
    val currentRead by rememberUpdatedState(read)
    val state = remember(prefs) { mutableStateOf(read()) }
    DisposableEffect(prefs) {
        val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, _ -> state.value = currentRead() }
        prefs.registerOnSharedPreferenceChangeListener(listener)
        onDispose { prefs.unregisterOnSharedPreferenceChangeListener(listener) }
    }
    return state
}
