package com.bissbilanz.analytics

import kotlin.math.abs
import kotlin.math.floor

/** Inputs to [calculateMaintenance]; mirrors the TS `MaintenanceInput`. */
data class MaintenanceInput(
    val weightChangeKg: Double,
    val avgDailyCalories: Double,
    val days: Int,
    val muscleRatio: Double = DEFAULT_MUSCLE_RATIO,
)

/** Result of [calculateMaintenance]; mirrors the TS `MaintenanceResult` field-for-field. */
data class MaintenanceResult(
    val maintenanceCalories: Double,
    val dailyDeficit: Double,
    val totalEnergyBalance: Double,
    val fatMassKg: Double,
    val muscleMassKg: Double,
    val fatCalories: Double,
    val muscleCalories: Double,
    val avgDailyCalories: Double,
    val weightChangeKg: Double,
    val days: Int,
    val muscleRatio: Double,
)

/**
 * Estimates maintenance calories from a window's weight change and average
 * intake. Returns null for a non-positive window or negative average intake,
 * matching the server contract exactly.
 *
 * A loss (negative [MaintenanceInput.weightChangeKg]) implies intake was below
 * maintenance, so the daily deficit is added back to the average to recover
 * maintenance; a gain subtracts. All public numbers are rounded the same way
 * the TS does (JS `Math.round`, i.e. round-half-up — see [jsRound]).
 *
 * Pure port of the server's `src/lib/utils/maintenance.ts` so the mobile apps
 * can compute maintenance on-device (local/anonymous users) and online users
 * can compute it from the synced local DB without an API round-trip. The
 * golden-vector parity suite (analytics-parity/) keeps this in lockstep with
 * the TS source.
 */
fun calculateMaintenance(input: MaintenanceInput): MaintenanceResult? {
    val weightChangeKg = input.weightChangeKg
    val avgDailyCalories = input.avgDailyCalories
    val days = input.days
    val muscleRatio = input.muscleRatio

    if (days <= 0 || avgDailyCalories < 0) return null

    val fatRatio = 1 - muscleRatio
    val fatMassKg = abs(weightChangeKg) * fatRatio
    val muscleMassKg = abs(weightChangeKg) * muscleRatio

    val fatCalories = fatMassKg * KCAL_PER_KG_FAT
    val muscleCalories = muscleMassKg * KCAL_PER_KG_MUSCLE
    val totalEnergy = fatCalories + muscleCalories

    val sign =
        when {
            weightChangeKg < 0 -> 1
            weightChangeKg > 0 -> -1
            else -> 0
        }
    val totalEnergyBalance = totalEnergy * sign
    val dailyDeficit = if (days > 0) totalEnergyBalance / days else 0.0

    val maintenanceCalories = jsRound(avgDailyCalories + dailyDeficit)

    return MaintenanceResult(
        maintenanceCalories = maintenanceCalories,
        dailyDeficit = jsRound(dailyDeficit),
        totalEnergyBalance = jsRound(totalEnergyBalance),
        fatMassKg = jsRound(fatMassKg * 100) / 100,
        muscleMassKg = jsRound(muscleMassKg * 100) / 100,
        fatCalories = jsRound(fatCalories),
        muscleCalories = jsRound(muscleCalories),
        avgDailyCalories = jsRound(avgDailyCalories),
        weightChangeKg = weightChangeKg,
        days = days,
        muscleRatio = muscleRatio,
    )
}

/**
 * JavaScript `Math.round` semantics: round half toward +infinity (`Math.round(2.5)
 * == 3`, `Math.round(-2.5) == -2`). Kotlin's `kotlin.math.round` rounds half to
 * even, so it cannot be used here without breaking byte-for-byte parity with the
 * TS server.
 */
internal fun jsRound(value: Double): Double = floor(value + 0.5)

/** A weight measurement with an optional date, for [smoothedWeightChange]. */
data class DatedWeight(
    val weightKg: Double,
    val entryDate: String? = null,
)

data class WeightChange(
    val firstWeight: Double,
    val lastWeight: Double,
    val weightChangeKg: Double,
)

private const val ANCHOR_WINDOW_DAYS = 7

/**
 * Weight change over the interval from smoothed endpoints. A single raw
 * measurement carries up to ~2 kg of fluid noise, so each endpoint is the mean
 * of the weights in the first / last seven days; the anchors sit inside the
 * interval, so their difference is scaled up to the full [days] by the anchors'
 * actual separation. Falls back to raw endpoints when the weights carry no
 * dates or the anchors overlap. Mirrors the TS `smoothedWeightChange`.
 */
fun smoothedWeightChange(
    weights: List<DatedWeight>,
    days: Int,
): WeightChange {
    val raw = WeightChange(weights.first().weightKg, weights.last().weightKg, weights.last().weightKg - weights.first().weightKg)
    if (weights.any { it.entryDate == null }) return raw

    val dated =
        weights
            .map {
                Pair(
                    kotlinx.datetime.LocalDate
                        .parse(it.entryDate!!)
                        .toEpochDays(),
                    it.weightKg,
                )
            }.sortedBy { it.first }
    val firstDay = dated.first().first
    val lastDay = dated.last().first
    val head = dated.filter { it.first < firstDay + ANCHOR_WINDOW_DAYS }
    val tail = dated.filter { it.first > lastDay - ANCHOR_WINDOW_DAYS }
    val headDay = head.sumOf { it.first.toDouble() } / head.size
    val tailDay = tail.sumOf { it.first.toDouble() } / tail.size
    val separation = tailDay - headDay
    if (separation <= 0) return raw

    val firstWeight = head.sumOf { it.second } / head.size
    val lastWeight = tail.sumOf { it.second } / tail.size
    return WeightChange(firstWeight, lastWeight, ((lastWeight - firstWeight) * days) / separation)
}
