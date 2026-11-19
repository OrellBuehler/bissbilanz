package com.bissbilanz.android.navigation

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class NavTabsTest {
    @Test
    fun aFreshInstallGetsTheDefaults() {
        assertEquals(listOf("foods", "favorites", "insights"), NavTabs.load(stored = null, legacy = null))
    }

    @Test
    fun theStoredOrderIsTheDisplayOrder() {
        assertEquals(listOf("sleep", "foods", "ai-tasks"), NavTabs.load("sleep,foods,ai-tasks", legacy = setOf("weight")))
    }

    @Test
    fun theOldSetMigratesInItsOldCanonicalOrder() {
        val legacy = setOf("recipe-suggestions", "weight", "favorites")

        assertEquals(listOf("favorites", "weight", "recipe-suggestions"), NavTabs.load(stored = null, legacy = legacy))
    }

    @Test
    fun anOldSetWithNothingKnownFallsBackToTheDefaults() {
        assertEquals(NavTabs.DEFAULT, NavTabs.load(stored = null, legacy = setOf("history")))
    }

    @Test
    fun unknownIdsAreDroppedAndDoNotCountTowardTheMaximum() {
        assertEquals(listOf("foods", "weight", "sleep"), NavTabs.load("foods,chat,weight,bogus,sleep", legacy = null))
    }

    @Test
    fun duplicatesAndBlanksAreRemoved() {
        assertEquals(listOf("foods", "weight"), NavTabs.load("foods, weight,foods,,weight", legacy = null))
    }

    @Test
    fun moreThanTheMaximumIsCut() {
        assertEquals(listOf("foods", "favorites", "insights"), NavTabs.load("foods,favorites,insights,weight", legacy = null))
    }

    @Test
    fun aStoredListWithNothingKnownFallsBackToTheDefaults() {
        assertEquals(NavTabs.DEFAULT, NavTabs.load("", legacy = null))
        assertEquals(NavTabs.DEFAULT, NavTabs.load("chat", legacy = null))
    }

    @Test
    fun serializeRoundTrips() {
        val tabs = listOf("ai-tasks", "recipe-suggestions", "calendar")

        assertEquals(tabs, NavTabs.load(NavTabs.serialize(tabs), legacy = null))
    }

    @Test
    fun accountOnlyTabsAreHiddenInLocalModeButKept() {
        val stored = listOf("foods", "ai-tasks", "sleep")

        assertEquals(listOf("foods", "sleep"), NavTabs.visible(stored, signedIn = false))
        assertEquals(stored, NavTabs.visible(stored, signedIn = true))
    }

    @Test
    fun theBarHasHomeFirstAndSettingsLast() {
        assertEquals(listOf("dashboard", "weight", "settings"), NavTabs.barRoutes(listOf("weight")))
    }

    @Test
    fun addAppendsUpToTheMaximum() {
        assertEquals(listOf("foods", "sleep"), NavTabs.add(listOf("foods"), "sleep", signedIn = true))

        val full = listOf("foods", "favorites", "insights")
        assertFalse(NavTabs.canAdd(full, "sleep", signedIn = true))
        assertEquals(full, NavTabs.add(full, "sleep", signedIn = true))
    }

    @Test
    fun addRejectsDuplicatesUnknownIdsAndAccountOnlyTabsWithoutAnAccount() {
        val tabs = listOf("foods")

        assertEquals(tabs, NavTabs.add(tabs, "foods", signedIn = true))
        assertEquals(tabs, NavTabs.add(tabs, "chat", signedIn = true))
        assertEquals(tabs, NavTabs.add(tabs, "ai-tasks", signedIn = false))
        assertEquals(listOf("foods", "ai-tasks"), NavTabs.add(tabs, "ai-tasks", signedIn = true))
    }

    @Test
    fun removeKeepsAtLeastOneTab() {
        assertEquals(listOf("weight"), NavTabs.remove(listOf("foods", "weight"), "foods"))

        assertFalse(NavTabs.canRemove(listOf("weight"), "weight"))
        assertEquals(listOf("weight"), NavTabs.remove(listOf("weight"), "weight"))
    }

    @Test
    fun moveReorders() {
        val tabs = listOf("foods", "favorites", "insights")

        assertEquals(listOf("insights", "foods", "favorites"), NavTabs.move(tabs, 2, 0))
        assertEquals(listOf("favorites", "foods", "insights"), NavTabs.move(tabs, 0, 1))
        assertEquals(tabs, NavTabs.move(tabs, 0, 3))
        assertEquals(tabs, NavTabs.move(tabs, -1, 0))
    }

    @Test
    fun theLandingTabFallsBackToHomeOnceItIsOffTheBar() {
        val visible = listOf("foods", "weight")

        assertEquals("weight", NavTabs.landingTab("weight", visible))
        assertEquals("dashboard", NavTabs.landingTab(null, visible))
        assertEquals("dashboard", NavTabs.landingTab("dashboard", visible))
        assertEquals("dashboard", NavTabs.landingTab("sleep", visible))
        // An account-only tab is not on the bar in Local mode.
        assertEquals("dashboard", NavTabs.landingTab("ai-tasks", NavTabs.visible(listOf("ai-tasks", "foods"), signedIn = false)))
    }

    @Test
    fun aTabDestinationIsItsTabsRootOnlyDirectlyOnHome() {
        val visible = listOf("weight", "sleep")

        assertTrue(NavTabs.isTabRoot("weight", "dashboard", visible))
        assertFalse(NavTabs.isTabRoot("weight", "food/{foodId}", visible))
        assertFalse(NavTabs.isTabRoot("weight", "settings", visible))
        assertFalse(NavTabs.isTabRoot("fasting", "dashboard", visible))
    }

    @Test
    fun everyCandidateHasABarEntryForItsRoute() {
        NavTabs.CANDIDATES.forEach { id -> assertEquals(id, tabScreen(id).route) }
    }
}
