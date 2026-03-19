package com.bissbilanz

import com.bissbilanz.api.generated.model.MacroSummary
import com.bissbilanz.api.generated.model.WeightEntry
import io.ktor.client.engine.*

expect fun createHttpEngine(): HttpClientEngine

interface HealthSyncService {
    suspend fun isAvailable(): Boolean

    suspend fun hasPermissions(): Boolean

    fun getRequiredPermissions(): Set<String>

    suspend fun syncWeight(entries: List<WeightEntry>)

    suspend fun syncNutrition(
        date: String,
        totals: MacroSummary,
    )
}
