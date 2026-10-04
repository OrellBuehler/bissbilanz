package com.bissbilanz.android.reminders

import com.bissbilanz.repository.SupplementRepository
import kotlinx.coroutines.withTimeoutOrNull

/**
 * How long a reminder waits for the server's answer before trusting the local cache.
 *
 * An alarm often fires while the phone is dozing, when the network is blocked and a
 * request just hangs. The receiver only has ~10 seconds in total, so waiting out the HTTP
 * timeout used to eat the whole budget and the reminder was dropped without a trace.
 */
const val TAKEN_CHECK_NETWORK_BUDGET_MS = 3_000L

/**
 * Whether [supplementId] is already ticked off on [date]. Asks the server first so a log
 * made on another device suppresses the nudge, and falls back to what this device knows
 * when the server does not answer in time: a redundant reminder beats a missing one.
 */
suspend fun SupplementRepository.isTaken(
    supplementId: String,
    date: String,
    networkBudgetMs: Long = TAKEN_CHECK_NETWORK_BUDGET_MS,
): Boolean {
    val logs = withTimeoutOrNull(networkBudgetMs) { getChecklist(date) } ?: cachedChecklist(date)
    return logs.any { it.supplementId == supplementId }
}
