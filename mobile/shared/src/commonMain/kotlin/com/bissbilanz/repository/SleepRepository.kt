package com.bissbilanz.repository

import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.model.SleepCreate
import com.bissbilanz.model.SleepEntry
import com.bissbilanz.model.SleepFoodCorrelationEntry
import com.bissbilanz.model.SleepUpdate
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

class SleepRepository(
    private val api: BissbilanzApi,
    private val errorReporter: ErrorReporter,
) {
    private val _entries = MutableStateFlow<List<SleepEntry>>(emptyList())
    val entries: Flow<List<SleepEntry>> = _entries.asStateFlow()

    suspend fun refresh(
        from: String? = null,
        to: String? = null,
    ) {
        try {
            _entries.value = api.getSleepEntries(from, to)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
        }
    }

    suspend fun createEntry(entry: SleepCreate): SleepEntry {
        val created = api.createSleepEntry(entry)
        _entries.value = listOf(created) + _entries.value
        return created
    }

    suspend fun updateEntry(
        id: String,
        entry: SleepUpdate,
    ): SleepEntry {
        val updated = api.updateSleepEntry(id, entry)
        _entries.value = _entries.value.map { if (it.id == id) updated else it }
        return updated
    }

    suspend fun deleteEntry(id: String) {
        api.deleteSleepEntry(id)
        _entries.value = _entries.value.filter { it.id != id }
    }

    suspend fun getSleepFoodCorrelation(
        startDate: String,
        endDate: String,
    ): List<SleepFoodCorrelationEntry> =
        try {
            api.getSleepFoodCorrelation(startDate, endDate)
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            errorReporter.captureException(e)
            emptyList()
        }
}
