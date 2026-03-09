package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.model.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class EntryRepository(private val api: BissbilanzApi) {
    private val _entries = MutableStateFlow<List<Entry>>(emptyList())
    val entries: StateFlow<List<Entry>> = _entries.asStateFlow()

    private var currentDate: String? = null

    suspend fun loadEntries(date: String) {
        currentDate = date
        _entries.value = api.getEntries(date)
    }

    suspend fun createEntry(entry: EntryCreate): Entry {
        val created = api.createEntry(entry)
        currentDate?.let { loadEntries(it) }
        return created
    }

    suspend fun updateEntry(id: String, entry: EntryUpdate): Entry {
        val updated = api.updateEntry(id, entry)
        currentDate?.let { loadEntries(it) }
        return updated
    }

    suspend fun deleteEntry(id: String) {
        api.deleteEntry(id)
        _entries.value = _entries.value.filter { it.id != id }
    }
}
