package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.model.Preferences
import com.bissbilanz.model.PreferencesUpdate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class PreferencesRepository(
    private val api: BissbilanzApi,
) {
    private val _preferences = MutableStateFlow<Preferences?>(null)
    val preferences: StateFlow<Preferences?> = _preferences.asStateFlow()

    suspend fun loadPreferences() {
        _preferences.value = api.getPreferences()
    }

    suspend fun updatePreferences(update: PreferencesUpdate): Preferences {
        val updated = api.updatePreferences(update)
        _preferences.value = updated
        return updated
    }
}
