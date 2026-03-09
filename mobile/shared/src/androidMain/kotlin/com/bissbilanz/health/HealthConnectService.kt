package com.bissbilanz.health

import com.bissbilanz.HealthSyncService
import com.bissbilanz.model.MacroTotals
import com.bissbilanz.model.WeightEntry

class HealthConnectService : HealthSyncService {
    override suspend fun isAvailable(): Boolean = false
    override suspend fun requestPermissions(): Boolean = false
    override suspend fun syncWeight(entries: List<WeightEntry>) {}
    override suspend fun syncNutrition(date: String, totals: MacroTotals) {}
}
