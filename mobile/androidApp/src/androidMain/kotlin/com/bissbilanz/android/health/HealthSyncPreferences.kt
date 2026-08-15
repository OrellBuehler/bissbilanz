package com.bissbilanz.android.health

import android.content.Context

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

    var writeNutrition: Boolean
        get() = prefs.getBoolean(KEY_WRITE_NUTRITION, false)
        set(value) = prefs.edit().putBoolean(KEY_WRITE_NUTRITION, value).apply()

    val anyEnabled: Boolean
        get() = readWeight || writeWeight || readSleep || writeSleep || writeNutrition

    private companion object {
        const val KEY_READ_WEIGHT = "read_weight"
        const val KEY_WRITE_WEIGHT = "write_weight"
        const val KEY_READ_SLEEP = "read_sleep"
        const val KEY_WRITE_SLEEP = "write_sleep"
        const val KEY_WRITE_NUTRITION = "write_nutrition"
    }
}
