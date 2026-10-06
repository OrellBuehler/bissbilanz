package com.bissbilanz.android.bulk

import java.util.Locale
import kotlin.test.Test
import kotlin.test.assertEquals

class BulkFormatTest {
    @Test
    fun groupsThousandsInTheUsersLocale() {
        val previous = Locale.getDefault()
        try {
            Locale.setDefault(Locale.US)
            assertEquals("12,340", formatCount(12_340))
            assertEquals("0", formatCount(0L))
        } finally {
            Locale.setDefault(previous)
        }
    }
}
