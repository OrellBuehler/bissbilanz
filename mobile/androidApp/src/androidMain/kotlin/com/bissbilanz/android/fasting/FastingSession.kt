package com.bissbilanz.android.fasting

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlin.time.Duration
import kotlin.time.Duration.Companion.hours
import kotlin.time.Duration.Companion.seconds
import kotlin.time.Instant

/**
 * A single fast — the one currently running ([endedAt] null) or a completed one
 * in the history. Mirrors the iOS `FastingSession`; the running session is the
 * canonical copy and lives in [FastingSessionStore] so the ongoing notification
 * and its End Fast action can read it without going through the repository.
 */
@Serializable
data class FastingSession(
    val id: String,
    val startedAtEpochMs: Long,
    val targetHours: Int,
    val endedAtEpochMs: Long? = null,
) {
    val startedAt: Instant get() = Instant.fromEpochMilliseconds(startedAtEpochMs)

    val endedAt: Instant? get() = endedAtEpochMs?.let { Instant.fromEpochMilliseconds(it) }

    val targetEnd: Instant get() = startedAt + targetHours.hours

    val duration: Duration? get() = endedAt?.let { it - startedAt }

    val reachedTarget: Boolean get() = (duration ?: Duration.ZERO) >= targetHours.hours

    /**
     * Progress toward the target in 0..1. Floors the denominator at a minute so a
     * malformed zero-hour session cannot divide by zero.
     */
    fun progress(now: Instant): Float {
        val target = maxOf(targetHours.hours, 60.seconds)
        return ((now - startedAt) / target).toFloat().coerceIn(0f, 1f)
    }

    fun elapsed(now: Instant): Duration = maxOf(now - startedAt, Duration.ZERO)
}

/**
 * Reads and writes the running fast and the finished-fast history. Backed by
 * plain SharedPreferences rather than the SQLDelight cache: the notification's
 * End Fast receiver needs it too, and the running fast is device-local state.
 * Finished fasts are pushed to the server through the sync queue (see
 * [FastingManager]) so the web history can show them; this store stays the
 * source of truth on the device.
 */
class FastingSessionStore(
    context: Context,
    private val json: Json,
) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun loadCurrent(): FastingSession? =
        prefs.getString(KEY_CURRENT, null)?.let {
            runCatching { json.decodeFromString<FastingSession>(it) }.getOrNull()
        }

    fun saveCurrent(session: FastingSession) {
        prefs.edit().putString(KEY_CURRENT, json.encodeToString(session)).apply()
    }

    fun clearCurrent() {
        prefs.edit().remove(KEY_CURRENT).apply()
    }

    /** Finished fasts, most recent first. */
    fun loadHistory(): List<FastingSession> =
        prefs.getString(KEY_HISTORY, null)?.let {
            runCatching { json.decodeFromString<List<FastingSession>>(it) }.getOrNull()
        } ?: emptyList()

    fun appendToHistory(session: FastingSession) {
        saveHistory(listOf(session) + loadHistory().filter { it.id != session.id })
    }

    /** Replaces the history record with the same id; re-sorts by start so an edited start keeps the list in order. */
    fun updateInHistory(session: FastingSession) {
        saveHistory(loadHistory().filter { it.id != session.id } + session)
    }

    fun removeFromHistory(id: String) {
        saveHistory(loadHistory().filter { it.id != id })
    }

    private fun saveHistory(history: List<FastingSession>) {
        val sorted = history.sortedByDescending { it.startedAtEpochMs }.take(HISTORY_LIMIT)
        prefs.edit().putString(KEY_HISTORY, json.encodeToString(sorted)).apply()
    }

    companion object {
        private const val PREFS_NAME = "fasting"
        private const val KEY_CURRENT = "fasting_session_v1"
        private const val KEY_HISTORY = "fasting_history_v1"
        private const val HISTORY_LIMIT = 60
    }
}
