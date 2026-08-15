package com.bissbilanz.android.health

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Mass
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.roundToInt

/** A body-weight sample read back out of Health Connect. */
data class WeightSample(
    val date: String,
    val weightKg: Double,
)

/** One night, aggregated from a Health Connect sleep session and its stages. */
data class SleepNight(
    val date: String,
    val durationMinutes: Int,
    val quality: Double,
    val bedtime: Instant,
    val wakeTime: Instant,
    val wakeUps: Int,
)

/**
 * Health Connect access, mirroring the iOS HealthKitService surface: read and
 * write body weight and sleep, and write daily nutrition totals.
 *
 * Every method degrades to a no-op or empty result when Health Connect is
 * missing or a permission was not granted, so callers never have to guard.
 */
class HealthConnectService(
    private val context: Context,
) {
    private fun client(): HealthConnectClient? = runCatching { HealthConnectClient.getOrCreate(context) }.getOrNull()

    val readPermissions =
        setOf(
            HealthPermission.getReadPermission(WeightRecord::class),
            HealthPermission.getReadPermission(SleepSessionRecord::class),
        )

    val writePermissions =
        setOf(
            HealthPermission.getWritePermission(WeightRecord::class),
            HealthPermission.getWritePermission(SleepSessionRecord::class),
            HealthPermission.getWritePermission(NutritionRecord::class),
        )

    val allPermissions = readPermissions + writePermissions

    fun isAvailable(): Boolean = HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE

    /** True when the SDK is installable but not yet installed — the UI offers a Play link. */
    fun needsProviderUpdate(): Boolean =
        HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED

    suspend fun grantedPermissions(): Set<String> = client()?.permissionController?.getGrantedPermissions() ?: emptySet()

    suspend fun has(permission: String): Boolean = permission in grantedPermissions()

    // MARK: - Weight

    suspend fun readWeights(since: Instant): List<WeightSample> {
        val client = client() ?: return emptyList()
        if (!has(HealthPermission.getReadPermission(WeightRecord::class))) return emptyList()
        val zone = ZoneId.systemDefault()
        return runCatching {
            client
                .readRecords(
                    ReadRecordsRequest(
                        recordType = WeightRecord::class,
                        timeRangeFilter = TimeRangeFilter.after(since),
                    ),
                ).records
                .map { record ->
                    WeightSample(
                        date =
                            record.time
                                .atZone(zone)
                                .toLocalDate()
                                .toString(),
                        weightKg = record.weight.inKilograms,
                    )
                }
        }.getOrDefault(emptyList())
    }

    suspend fun writeWeight(
        weightKg: Double,
        date: String,
    ): Boolean {
        val client = client() ?: return false
        if (!has(HealthPermission.getWritePermission(WeightRecord::class))) return false
        val zone = ZoneId.systemDefault()
        val instant = LocalDate.parse(date).atStartOfDay(zone).toInstant()
        return runCatching {
            client.insertRecords(
                listOf(
                    WeightRecord(
                        weight = Mass.kilograms(weightKg),
                        time = instant,
                        zoneOffset = zone.rules.getOffset(instant),
                        metadata = upsertMetadata("weight-$date"),
                    ),
                ),
            )
        }.isSuccess
    }

    // MARK: - Sleep

    suspend fun readSleep(since: Instant): List<SleepNight> {
        val client = client() ?: return emptyList()
        if (!has(HealthPermission.getReadPermission(SleepSessionRecord::class))) return emptyList()
        val zone = ZoneId.systemDefault()
        return runCatching {
            client
                .readRecords(
                    ReadRecordsRequest(
                        recordType = SleepSessionRecord::class,
                        timeRangeFilter = TimeRangeFilter.after(since),
                    ),
                ).records
                .mapNotNull { session -> session.toNight(zone) }
        }.getOrDefault(emptyList())
    }

    suspend fun writeSleep(
        bedtime: Instant,
        wakeTime: Instant,
        date: String,
    ): Boolean {
        val client = client() ?: return false
        if (!has(HealthPermission.getWritePermission(SleepSessionRecord::class))) return false
        val zone = ZoneId.systemDefault()
        return runCatching {
            client.insertRecords(
                listOf(
                    SleepSessionRecord(
                        startTime = bedtime,
                        startZoneOffset = zone.rules.getOffset(bedtime),
                        endTime = wakeTime,
                        endZoneOffset = zone.rules.getOffset(wakeTime),
                        metadata = upsertMetadata("sleep-$date"),
                    ),
                ),
            )
        }.isSuccess
    }

    // MARK: - Nutrition

    suspend fun writeNutrition(
        date: String,
        calories: Double,
        protein: Double,
        carbs: Double,
        fat: Double,
        fiber: Double,
    ): Boolean {
        val client = client() ?: return false
        if (!has(HealthPermission.getWritePermission(NutritionRecord::class))) return false
        val zone = ZoneId.systemDefault()
        val localDate = LocalDate.parse(date)
        val start = localDate.atStartOfDay(zone).toInstant()
        val end = localDate.plusDays(1).atStartOfDay(zone).toInstant()
        return runCatching {
            client.insertRecords(
                listOf(
                    NutritionRecord(
                        startTime = start,
                        startZoneOffset = zone.rules.getOffset(start),
                        endTime = end,
                        endZoneOffset = zone.rules.getOffset(end),
                        energy = Energy.kilocalories(calories),
                        protein = Mass.grams(protein),
                        totalCarbohydrate = Mass.grams(carbs),
                        totalFat = Mass.grams(fat),
                        dietaryFiber = Mass.grams(fiber),
                        metadata = upsertMetadata("nutrition-$date"),
                    ),
                ),
            )
        }.isSuccess
    }

    /**
     * Health Connect has no update call: inserting again would append a second
     * record for the same day, and for cumulative nutrition totals a reader sums
     * them. A stable clientRecordId makes the insert an upsert instead, with the
     * write time as the version so the newest totals always win.
     */
    private fun upsertMetadata(clientRecordId: String): Metadata =
        Metadata.manualEntry(
            clientRecordId = clientRecordId,
            clientRecordVersion = System.currentTimeMillis(),
        )
}

/**
 * Folds a sleep session into the app's night shape. The night is filed under the
 * wake-up date, matching how the app (and iOS) attribute a night's sleep.
 */
internal fun SleepSessionRecord.toNight(zone: ZoneId): SleepNight? {
    val totalMinutes =
        java.time.Duration
            .between(startTime, endTime)
            .toMinutes()
            .toInt()
    if (totalMinutes <= 0) return null
    val awakeMinutes =
        stages
            .filter { it.stage == SleepSessionRecord.STAGE_TYPE_AWAKE }
            .sumOf {
                java.time.Duration
                    .between(it.startTime, it.endTime)
                    .toMinutes()
            }.toInt()
    val asleepMinutes = (totalMinutes - awakeMinutes).coerceAtLeast(0)
    return SleepNight(
        date = endTime.atZone(zone).toLocalDate().toString(),
        durationMinutes = asleepMinutes.takeIf { it > 0 } ?: totalMinutes,
        quality = derivedQuality(asleepMinutes, totalMinutes, stages),
        bedtime = startTime,
        wakeTime = endTime,
        wakeUps = stages.count { it.stage == SleepSessionRecord.STAGE_TYPE_AWAKE },
    )
}

/**
 * A 1–10 score standing in for the sleep quality the user would otherwise type.
 * Health Connect exposes no quality field, so this blends efficiency (time asleep
 * over time in bed) with duration against an 8h ideal — the same two signals the
 * iOS derivation leans on.
 */
internal fun derivedQuality(
    asleepMinutes: Int,
    totalMinutes: Int,
    stages: List<SleepSessionRecord.Stage>,
): Double {
    if (totalMinutes <= 0) return 5.0
    val efficiency = (asleepMinutes.toDouble() / totalMinutes).coerceIn(0.0, 1.0)
    val durationScore = (asleepMinutes / 480.0).coerceIn(0.0, 1.0)
    // Deep and REM sleep are the restorative stages; when a device reports them,
    // let them nudge the score rather than dominate it.
    val restorative =
        stages
            .filter {
                it.stage == SleepSessionRecord.STAGE_TYPE_DEEP || it.stage == SleepSessionRecord.STAGE_TYPE_REM
            }.sumOf {
                java.time.Duration
                    .between(it.startTime, it.endTime)
                    .toMinutes()
            }.toInt()
    val restorativeScore =
        if (asleepMinutes > 0 && restorative > 0) {
            (restorative.toDouble() / asleepMinutes / 0.45).coerceIn(0.0, 1.0)
        } else {
            null
        }

    val blended =
        if (restorativeScore != null) {
            0.4 * efficiency + 0.4 * durationScore + 0.2 * restorativeScore
        } else {
            0.5 * efficiency + 0.5 * durationScore
        }
    return ((blended * 9) + 1).roundToInt().coerceIn(1, 10).toDouble()
}
