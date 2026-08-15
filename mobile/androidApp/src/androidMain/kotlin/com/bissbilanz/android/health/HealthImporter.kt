package com.bissbilanz.android.health

import com.bissbilanz.ErrorReporter
import com.bissbilanz.api.generated.model.SleepCreate
import com.bissbilanz.model.WeightCreate
import com.bissbilanz.repository.SleepRepository
import com.bissbilanz.repository.WeightRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.first
import java.time.Instant
import java.time.temporal.ChronoUnit

/**
 * Pulls weight and sleep out of Health Connect into the app's own store, matching
 * the iOS HealthKitImporter: a fixed look-back window, one entry per day, and days
 * that already have an entry are left alone so a manual log always wins.
 */
class HealthImporter(
    private val health: HealthConnectService,
    private val prefs: HealthSyncPreferences,
    private val weightRepository: WeightRepository,
    private val sleepRepository: SleepRepository,
    private val errorReporter: ErrorReporter,
) {
    suspend fun importAllIfEnabled(): Boolean {
        if (!health.isAvailable()) return false
        val weights = importWeightsIfEnabled()
        val sleep = importSleepIfEnabled()
        return weights || sleep
    }

    suspend fun importWeightsIfEnabled(): Boolean {
        if (!prefs.readWeight) return false
        return try {
            val samples = health.readWeights(since())
            if (samples.isEmpty()) return false
            val existing =
                weightRepository
                    .entries()
                    .first()
                    .map { it.entryDate }
                    .toSet()
            // Latest sample per day wins, mirroring iOS.
            val latestPerDay = samples.associateBy { it.date }
            var imported = false
            latestPerDay.values
                .filter { it.date !in existing }
                .forEach { sample ->
                    weightRepository.createEntry(
                        WeightCreate(weightKg = sample.weightKg, entryDate = sample.date),
                    )
                    imported = true
                }
            imported
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            errorReporter.captureException(e)
            false
        }
    }

    suspend fun importSleepIfEnabled(): Boolean {
        if (!prefs.readSleep) return false
        return try {
            val nights = health.readSleep(since())
            if (nights.isEmpty()) return false
            val existing =
                sleepRepository
                    .entries()
                    .first()
                    .map { it.entryDate }
                    .toSet()
            // One night per day, the longest session winning: Health Connect files a
            // nap and the night it ends on under the same date, and importing both
            // would leave the day with two sleep entries.
            val longestPerDay =
                nights
                    .groupBy { it.date }
                    .mapValues { (_, sessions) -> sessions.maxBy { it.durationMinutes } }
            var imported = false
            longestPerDay.values
                .filter { it.date !in existing }
                .forEach { night ->
                    sleepRepository.createEntry(
                        SleepCreate(
                            durationMinutes = night.durationMinutes,
                            quality = night.quality,
                            entryDate = night.date,
                            bedtime = night.bedtime.toString(),
                            wakeTime = night.wakeTime.toString(),
                            wakeUps = night.wakeUps,
                        ),
                    )
                    imported = true
                }
            imported
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            errorReporter.captureException(e)
            false
        }
    }

    private fun since(): Instant = Instant.now().minus(IMPORT_WINDOW_DAYS, ChronoUnit.DAYS)

    private companion object {
        /** How far back imports look, matching the iOS window. */
        const val IMPORT_WINDOW_DAYS = 90L
    }
}
