package com.bissbilanz.android.health

import android.content.Context
import com.bissbilanz.ErrorReporter
import com.bissbilanz.repository.EntryRepository
import com.bissbilanz.repository.SleepRepository
import com.bissbilanz.repository.WeightRepository
import com.bissbilanz.util.resolvedCalories
import com.bissbilanz.util.resolvedCarbs
import com.bissbilanz.util.resolvedFat
import com.bissbilanz.util.resolvedFiber
import com.bissbilanz.util.resolvedProtein
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.first
import java.time.Instant

/**
 * Pushes the app's own entries out to Health Connect.
 *
 * Health Connect has no upsert, so each export records what it last wrote in
 * [markers] and skips when nothing changed. Without that, every unrelated
 * repository change — a food edit, a widget refresh — would append another
 * duplicate record for the same day.
 */
class HealthExporter(
    context: Context,
    private val health: HealthConnectService,
    private val prefs: HealthSyncPreferences,
    private val weightRepository: WeightRepository,
    private val sleepRepository: SleepRepository,
    private val entryRepository: EntryRepository,
    private val errorReporter: ErrorReporter,
) {
    private val markers = context.getSharedPreferences("health_export_markers", Context.MODE_PRIVATE)

    suspend fun exportLatestWeight() {
        if (!prefs.writeWeight || !health.isAvailable()) return
        runSafely {
            val latest = weightRepository.entries().first().maxByOrNull { it.entryDate } ?: return@runSafely
            val marker = "${latest.entryDate}:${latest.weightKg}"
            if (markers.getString(KEY_WEIGHT, null) == marker) return@runSafely
            health.writeWeight(latest.weightKg, latest.entryDate)
            markers.edit().putString(KEY_WEIGHT, marker).apply()
        }
    }

    suspend fun exportLatestSleep() {
        if (!prefs.writeSleep || !health.isAvailable()) return
        runSafely {
            val latest = sleepRepository.entries().first().maxByOrNull { it.entryDate } ?: return@runSafely
            val bedtime = latest.bedtime ?: return@runSafely
            val wakeTime = latest.wakeTime ?: return@runSafely
            val marker = "${latest.entryDate}:$bedtime:$wakeTime"
            if (markers.getString(KEY_SLEEP, null) == marker) return@runSafely
            health.writeSleep(Instant.parse(bedtime), Instant.parse(wakeTime))
            markers.edit().putString(KEY_SLEEP, marker).apply()
        }
    }

    suspend fun exportNutrition(date: String) {
        if (!prefs.writeNutrition || !health.isAvailable()) return
        runSafely {
            val entries = entryRepository.entriesByDate(date).first()
            if (entries.isEmpty()) return@runSafely
            val calories = entries.sumOf { it.resolvedCalories() }
            val protein = entries.sumOf { it.resolvedProtein() }
            val carbs = entries.sumOf { it.resolvedCarbs() }
            val fat = entries.sumOf { it.resolvedFat() }
            val fiber = entries.sumOf { it.resolvedFiber() }
            val marker = "$date:$calories:$protein:$carbs:$fat:$fiber"
            if (markers.getString(KEY_NUTRITION, null) == marker) return@runSafely
            health.writeNutrition(date, calories, protein, carbs, fat, fiber)
            markers.edit().putString(KEY_NUTRITION, marker).apply()
        }
    }

    private inline fun runSafely(block: () -> Unit) {
        try {
            block()
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            errorReporter.captureException(e)
        }
    }

    private companion object {
        const val KEY_WEIGHT = "last_weight"
        const val KEY_SLEEP = "last_sleep"
        const val KEY_NUTRITION = "last_nutrition"
    }
}
