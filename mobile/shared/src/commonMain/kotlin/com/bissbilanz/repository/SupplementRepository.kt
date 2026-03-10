package com.bissbilanz.repository

import com.bissbilanz.api.BissbilanzApi
import com.bissbilanz.model.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class SupplementRepository(
    private val api: BissbilanzApi,
) {
    private val _supplements = MutableStateFlow<List<Supplement>>(emptyList())
    val supplements: StateFlow<List<Supplement>> = _supplements.asStateFlow()

    suspend fun loadSupplements() {
        _supplements.value = api.getSupplements()
    }

    suspend fun createSupplement(supplement: SupplementCreate): Supplement {
        val created = api.createSupplement(supplement)
        loadSupplements()
        return created
    }

    suspend fun deleteSupplement(id: String) {
        api.deleteSupplement(id)
        _supplements.value = _supplements.value.filter { it.id != id }
    }

    suspend fun logSupplement(
        supplementId: String,
        date: String? = null,
    ): SupplementLog = api.logSupplement(supplementId, date)

    suspend fun unlogSupplement(
        supplementId: String,
        date: String,
    ) = api.unlogSupplement(supplementId, date)
}
