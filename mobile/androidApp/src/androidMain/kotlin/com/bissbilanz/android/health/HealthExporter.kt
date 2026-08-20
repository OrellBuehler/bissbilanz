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
import java.time.LocalDate

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
            // Only remember what actually landed: a marker stored after a denied
            // permission or a failed write would skip that value forever.
            if (health.writeWeight(latest.weightKg, latest.entryDate)) {
                markers.edit().putString(KEY_WEIGHT, marker).apply()
            }
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
            if (health.writeSleep(Instant.parse(bedtime), Instant.parse(wakeTime), latest.entryDate)) {
                markers.edit().putString(KEY_SLEEP, marker).apply()
            }
        }
    }

    /**
     * Markers are per date: refreshes export whichever day was refreshed, so a
     * single last-write marker would see today and a viewed past day alternate
     * and rewrite both on every visit.
     */
    suspend fun exportNutrition(date: String) {
        if (!prefs.writeNutrition || !health.isAvailable()) return
        runSafely {
            val entries = entryRepository.entriesByDate(date).first()
            val key = "$KEY_NUTRITION_PREFIX$date"
            val previous = markers.getString(key, null)
            // An empty day that was never exported has nothing to zero out;
            // one that was exported before must be rewritten to zeros.
            if (entries.isEmpty() && previous == null) return@runSafely
            val calories = entries.sumOf { it.resolvedCalories() }
            val protein = entries.sumOf { it.resolvedProtein() }
            val carbs = entries.sumOf { it.resolvedCarbs() }
            val fat = entries.sumOf { it.resolvedFat() }
            val fiber = entries.sumOf { it.resolvedFiber() }
            val marker = "$calories:$protein:$carbs:$fat:$fiber"
            if (previous == marker) return@runSafely
            if (health.writeNutrition(date, calories, protein, carbs, fat, fiber)) {
                markers.edit().putString(key, marker).apply()
                pruneNutritionMarkers(date)
            }
        }
    }

    /**
     * Drops nutrition markers older than 30 days so the prefs file doesn't
     * grow one key per day forever. Keys embed yyyy-MM-dd dates, so string
     * order is date order.
     */
    private fun pruneNutritionMarkers(currentDate: String) {
        val cutoff = "$KEY_NUTRITION_PREFIX${LocalDate.parse(currentDate).minusDays(30)}"
        val stale = markers.all.keys.filter { it.startsWith(KEY_NUTRITION_PREFIX) && it < cutoff }
        if (stale.isEmpty()) return
        val editor = markers.edit()
        stale.forEach(editor::remove)
        editor.apply()
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
        const val KEY_NUTRITION_PREFIX = "last_nutrition_"
    }
}
