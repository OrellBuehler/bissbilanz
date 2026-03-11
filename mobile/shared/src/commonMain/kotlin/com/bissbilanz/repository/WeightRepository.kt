package com.bissbilanz.repository

import com.bissbilanz.HealthSyncService
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.model.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class WeightRepository(
    private val api: BissbilanzApi,
    private val healthSync: HealthSyncService,
) {
    private val _entries = MutableStateFlow<List<WeightEntry>>(emptyList())
    val entries: StateFlow<List<WeightEntry>> = _entries.asStateFlow()

    suspend fun loadEntries(limit: Int = 30) {
        _entries.value = api.getWeightEntries(limit)
    }

    suspend fun createEntry(entry: WeightCreate): WeightEntry {
        val created = api.createWeightEntry(entry)
        loadEntries()
        try {
            healthSync.syncWeight(listOf(created))
        } catch (_: Exception) {
        }
        return created
    }

    suspend fun updateEntry(
        id: String,
        entry: WeightUpdate,
    ): WeightEntry {
        val updated = api.updateWeightEntry(id, entry)
        loadEntries()
        try {
            healthSync.syncWeight(listOf(updated))
        } catch (_: Exception) {
        }
        return updated
    }

    suspend fun deleteEntry(id: String) {
        api.deleteWeightEntry(id)
        _entries.value = _entries.value.filter { it.id != id }
    }
}
