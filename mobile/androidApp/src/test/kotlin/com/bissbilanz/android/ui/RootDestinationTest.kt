package com.bissbilanz.android.ui

import com.bissbilanz.auth.AuthState
import com.bissbilanz.mode.AppMode
import kotlin.test.Test
import kotlin.test.assertEquals

class RootDestinationTest {
    private val allModes = listOf(null, AppMode.LOCAL, AppMode.SYNCED)

    @Test
    fun loadingShowsSpinnerRegardlessOfMode() {
        allModes.forEach { mode ->
            assertEquals(RootDestination.Loading, resolveRootDestination(AuthState.Loading, mode))
        }
    }

    @Test
    fun authenticatedWithLocalModeGoesToMigration() {
        assertEquals(RootDestination.Migration, resolveRootDestination(AuthState.Authenticated, AppMode.LOCAL))
    }

    @Test
    fun refreshingWithLocalModeGoesToMigration() {
        assertEquals(RootDestination.Migration, resolveRootDestination(AuthState.Refreshing, AppMode.LOCAL))
    }

    @Test
    fun authenticatedWithSyncedModeGoesToApp() {
        assertEquals(RootDestination.App, resolveRootDestination(AuthState.Authenticated, AppMode.SYNCED))
    }

    @Test
    fun authenticatedWithNoModeGoesToApp() {
        // Existing installs and fresh logins: mode is null, sync is allowed.
        assertEquals(RootDestination.App, resolveRootDestination(AuthState.Authenticated, null))
    }

    @Test
    fun refreshingWithSyncedModeGoesToApp() {
        assertEquals(RootDestination.App, resolveRootDestination(AuthState.Refreshing, AppMode.SYNCED))
    }

    @Test
    fun refreshingWithNoModeGoesToApp() {
        assertEquals(RootDestination.App, resolveRootDestination(AuthState.Refreshing, null))
    }

    @Test
    fun unauthenticatedWithLocalModeGoesToAppAnonymously() {
        assertEquals(RootDestination.App, resolveRootDestination(AuthState.Unauthenticated, AppMode.LOCAL))
    }

    @Test
    fun sessionExpiredWithLocalModeGoesToAppAnonymously() {
        assertEquals(RootDestination.App, resolveRootDestination(AuthState.SessionExpired, AppMode.LOCAL))
    }

    @Test
    fun unauthenticatedWithSyncedModeGoesToLogin() {
        assertEquals(RootDestination.Login, resolveRootDestination(AuthState.Unauthenticated, AppMode.SYNCED))
    }

    @Test
    fun unauthenticatedWithNoModeGoesToLogin() {
        assertEquals(RootDestination.Login, resolveRootDestination(AuthState.Unauthenticated, null))
    }

    @Test
    fun sessionExpiredWithSyncedModeGoesToLogin() {
        assertEquals(RootDestination.Login, resolveRootDestination(AuthState.SessionExpired, AppMode.SYNCED))
    }

    @Test
    fun sessionExpiredWithNoModeGoesToLogin() {
        assertEquals(RootDestination.Login, resolveRootDestination(AuthState.SessionExpired, null))
    }
}
