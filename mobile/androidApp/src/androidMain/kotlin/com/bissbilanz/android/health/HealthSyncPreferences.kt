package com.bissbilanz.android.health

import android.content.Context
import java.time.Instant

/**
 * Per-direction Health Connect toggles. Split the way iOS splits them: someone
 * whose scale already writes to Health Connect wants the read side only, and
 * would get duplicates if the app wrote back.
 */
class HealthSyncPreferences(
    context: Context,
) {
    private val prefs = context.getSharedPreferences("health_connect", Context.MODE_PRIVATE)

    var readWeight: Boolean
        get() = prefs.getBoolean(KEY_READ_WEIGHT, false)
        set(value) = prefs.edit().putBoolean(KEY_READ_WEIGHT, value).apply()

    var writeWeight: Boolean
        get() = prefs.getBoolean(KEY_WRITE_WEIGHT, false)
        set(value) = prefs.edit().putBoolean(KEY_WRITE_WEIGHT, value).apply()

    var readSleep: Boolean
        get() = prefs.getBoolean(KEY_READ_SLEEP, false)
        set(value) = prefs.edit().putBoolean(KEY_READ_SLEEP, value).apply()

    var writeSleep: Boolean
        get() = prefs.getBoolean(KEY_WRITE_SLEEP, false)
        set(value) = prefs.edit().putBoolean(KEY_WRITE_SLEEP, value).apply()

    /** Reads workout active calories into the day's `activityCalories` day property. */
    var readActivity: Boolean
        get() = prefs.getBoolean(KEY_READ_ACTIVITY, false)
        set(value) = prefs.edit().putBoolean(KEY_READ_ACTIVITY, value).apply()

    var writeNutrition: Boolean
        get() = prefs.getBoolean(KEY_WRITE_NUTRITION, false)
        set(value) = prefs.edit().putBoolean(KEY_WRITE_NUTRITION, value).apply()

    /** Timestamp of the last successful export or import, for the settings screen's status row. */
    var lastSyncedAt: Instant?
        get() = prefs.getLong(KEY_LAST_SYNCED_AT, -1L).takeIf { it >= 0 }?.let(Instant::ofEpochMilli)
        set(value) {
            val editor = prefs.edit()
            if (value == null) {
                editor.remove(KEY_LAST_SYNCED_AT)
            } else {
                editor.putLong(KEY_LAST_SYNCED_AT, value.toEpochMilli())
            }
            editor.apply()
        }

    /**
     * Timestamp of the last successful activity-calories import. Unset means the next
     * import scans the full look-back window; otherwise it only scans the short recent
     * window, since workouts are entered close to when they happened.
     */
    var lastActivityImportAt: Instant?
        get() = prefs.getLong(KEY_LAST_ACTIVITY_IMPORT_AT, -1L).takeIf { it >= 0 }?.let(Instant::ofEpochMilli)
        set(value) {
            val editor = prefs.edit()
            if (value == null) {
                editor.remove(KEY_LAST_ACTIVITY_IMPORT_AT)
            } else {
                editor.putLong(KEY_LAST_ACTIVITY_IMPORT_AT, value.toEpochMilli())
            }
            editor.apply()
        }

    val anyEnabled: Boolean
        get() = readWeight || writeWeight || readSleep || writeSleep || writeNutrition || readActivity

    /** Per-nutrient opt-in for [EXTENDED_HEALTH_NUTRIENTS], off by default like iOS. */
    fun nutrientEnabled(key: String): Boolean = prefs.getBoolean(nutrientPrefKey(key), false)

    fun setNutrientEnabled(
        key: String,
        value: Boolean,
    ) {
        prefs.edit().putBoolean(nutrientPrefKey(key), value).apply()
    }

    fun setAllNutrientsEnabled(value: Boolean) {
        val editor = prefs.edit()
        EXTENDED_HEALTH_NUTRIENTS.forEach { editor.putBoolean(nutrientPrefKey(it.key), value) }
        editor.apply()
    }

    fun enabledNutrientKeys(): Set<String> = EXTENDED_HEALTH_NUTRIENTS.filter { nutrientEnabled(it.key) }.map { it.key }.toSet()

    /** Turns every toggle off and clears the last-synced marker, for the settings screen's disconnect action. */
    fun reset() {
        prefs.edit().clear().apply()
    }

    private fun nutrientPrefKey(key: String) = "$KEY_NUTRIENT_PREFIX$key"

    private companion object {
        const val KEY_READ_WEIGHT = "read_weight"
        const val KEY_WRITE_WEIGHT = "write_weight"
        const val KEY_READ_SLEEP = "read_sleep"
        const val KEY_WRITE_SLEEP = "write_sleep"
        const val KEY_READ_ACTIVITY = "read_activity"
        const val KEY_WRITE_NUTRITION = "write_nutrition"
        const val KEY_LAST_SYNCED_AT = "last_synced_at"
        const val KEY_LAST_ACTIVITY_IMPORT_AT = "last_activity_import_at"
        const val KEY_NUTRIENT_PREFIX = "nutrient_"
    }
}
