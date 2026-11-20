package com.bissbilanz.android.chat

import kotlin.time.Clock
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Instant

/**
 * The diary day the user has open (the dashboard's day or a day log), so the assistant chat can
 * tell the server which day "this" refers to. Opening the chat takes the diary screen off
 * screen, so a day stays current for [RECENT] after its screen left; a day looked at longer ago
 * than that is no longer what the user has in mind, and no day is sent.
 */
class ViewedDiaryDay(
    private val clock: () -> Instant = { Clock.System.now() },
) {
    private var date: String? = null
    private var leftAt: Instant? = null

    @Synchronized
    fun viewing(date: String) {
        this.date = date
        leftAt = null
    }

    /** The screen showing [date] left composition. */
    @Synchronized
    fun left(date: String) {
        if (this.date == date) leftAt = clock()
    }

    @Synchronized
    fun current(): String? {
        val left = leftAt ?: return date
        return date.takeIf { clock() - left < RECENT }
    }

    companion object {
        val RECENT = 15.minutes
    }
}
