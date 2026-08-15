package com.bissbilanz.android.fasting

import android.content.Context
import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlin.time.Duration
import kotlin.time.Duration.Companion.hours
import kotlin.time.Duration.Companion.seconds

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
 * End Fast receiver needs it too, and a fast is device-local state that never
 * syncs — only the resulting "fasting day" flag does.
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
        val history = (listOf(session) + loadHistory()).take(HISTORY_LIMIT)
        prefs.edit().putString(KEY_HISTORY, json.encodeToString(history)).apply()
    }

    companion object {
        private const val PREFS_NAME = "fasting"
        private const val KEY_CURRENT = "fasting_session_v1"
        private const val KEY_HISTORY = "fasting_history_v1"
        private const val HISTORY_LIMIT = 60
    }
}
