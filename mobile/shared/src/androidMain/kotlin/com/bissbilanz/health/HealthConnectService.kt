package com.bissbilanz.health

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Mass
import com.bissbilanz.HealthSyncService
import com.bissbilanz.api.generated.model.MacroSummary
import com.bissbilanz.api.generated.model.WeightEntry
import java.time.LocalDate
import java.time.ZoneId

class HealthConnectService(
    private val context: Context,
) : HealthSyncService {
    private val requiredPermissions =
        setOf(
            HealthPermission.getWritePermission(WeightRecord::class),
            HealthPermission.getWritePermission(NutritionRecord::class),
        )

    private fun getClient(): HealthConnectClient? =
        try {
            HealthConnectClient.getOrCreate(context)
        } catch (_: Exception) {
            null
        }

    override suspend fun isAvailable(): Boolean = HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE

    override suspend fun hasPermissions(): Boolean {
        val client = getClient() ?: return false
        val granted = client.permissionController.getGrantedPermissions()
        return granted.containsAll(requiredPermissions)
    }

    override fun getRequiredPermissions(): Set<String> = requiredPermissions

    override suspend fun syncWeight(entries: List<WeightEntry>) {
        val client = getClient() ?: return
        if (!hasPermissions()) return
        val records =
            entries.map { entry ->
                val date = LocalDate.parse(entry.entryDate)
                val instant = date.atStartOfDay(ZoneId.systemDefault()).toInstant()
                WeightRecord(
                    weight = Mass.kilograms(entry.weightKg),
                    time = instant,
                    zoneOffset = ZoneId.systemDefault().rules.getOffset(instant),
                )
            }
        if (records.isNotEmpty()) {
            client.insertRecords(records)
        }
    }

    override suspend fun syncNutrition(
        date: String,
        totals: MacroSummary,
    ) {
        val client = getClient() ?: return
        if (!hasPermissions()) return
        val localDate = LocalDate.parse(date)
        val zone = ZoneId.systemDefault()
        val startInstant = localDate.atStartOfDay(zone).toInstant()
        val endInstant = localDate.plusDays(1).atStartOfDay(zone).toInstant()
        val record =
            NutritionRecord(
                startTime = startInstant,
                startZoneOffset = zone.rules.getOffset(startInstant),
                endTime = endInstant,
                endZoneOffset = zone.rules.getOffset(endInstant),
                energy = Energy.kilocalories(totals.calories),
                protein = Mass.grams(totals.protein),
                totalCarbohydrate = Mass.grams(totals.carbs),
                totalFat = Mass.grams(totals.fat),
                dietaryFiber = Mass.grams(totals.fiber),
            )
        client.insertRecords(listOf(record))
    }
}
