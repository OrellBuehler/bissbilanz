package com.bissbilanz

import io.ktor.client.engine.*

expect fun createHttpEngine(): HttpClientEngine

interface HealthSyncService {
    suspend fun isAvailable(): Boolean

    suspend fun hasPermissions(): Boolean

    fun getRequiredPermissions(): Set<String>

    suspend fun syncWeight(entries: List<com.bissbilanz.model.WeightEntry>)

    suspend fun syncNutrition(
        date: String,
        totals: com.bissbilanz.model.MacroTotals,
    )
}
