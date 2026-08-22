package com.bissbilanz.android.ui.screens

import com.bissbilanz.mode.AppMode
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class LoginScreenTest {
    @Test
    fun continueWithoutAccountIsHiddenForSessionExpiredSyncedUsers() {
        // A SYNCED user on the login screen is the session-expired re-login case:
        // offering Local mode would turn the leftover account cache into "local data"
        // and duplicate everything on the next sign-in.
        assertFalse(showContinueWithoutAccount(AppMode.SYNCED))
    }

    @Test
    fun continueWithoutAccountIsOfferedWhenNoModeWasChosen() {
        assertTrue(showContinueWithoutAccount(null))
    }

    @Test
    fun continueWithoutAccountStaysAvailableInLocalMode() {
        // Local-mode users never see the login screen via root routing, but the option
        // must not regress if they do (e.g. transient states).
        assertTrue(showContinueWithoutAccount(AppMode.LOCAL))
    }

    @Test
    fun visibleProvidersKeepDisplayOrderRegardlessOfServerOrder() {
        val visible = visibleLoginProviders(listOf("google", "infomaniak"))
        assertEquals(listOf("infomaniak", "google"), visible.map { it.first })
    }

    @Test
    fun visibleProvidersIgnoreUnknownServerIds() {
        val visible = visibleLoginProviders(listOf("infomaniak", "facebook"))
        assertEquals(listOf("infomaniak"), visible.map { it.first })
    }

    @Test
    fun defaultProvidersMatchWhatProductionHasConfigured() {
        // The fallback shown while /api/auth/providers is loading or unreachable —
        // must never hide a provider that works in production.
        assertEquals(listOf("infomaniak", "google"), defaultEnabledProviders)
    }
}
