package com.bissbilanz.android.navigation

import android.app.Application
import android.content.Context
import androidx.navigation.compose.ComposeNavigator
import androidx.navigation.createGraph
import androidx.navigation.testing.TestNavHostController
import androidx.test.core.app.ApplicationProvider
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertNull

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = NavTabPrefsTest.TestApp::class)
class NavTabPrefsTest {
    class TestApp : Application()

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private val raw get() = context.getSharedPreferences(NavTabPrefs.PREFS_NAME, Context.MODE_PRIVATE)

    @Before
    fun clear() {
        raw.edit().clear().commit()
    }

    @Test
    fun theOldSetIsMigratedOnceIntoTheOrderedList() {
        raw.edit().putStringSet(NavTabPrefs.KEY_LEGACY_TABS, setOf("supplements", "foods", "weight")).commit()

        assertEquals(listOf("foods", "weight", "supplements"), NavTabPrefs(context).tabs())
        assertEquals("foods,weight,supplements", raw.getString(NavTabPrefs.KEY_TABS, null))

        // The ordered list is the truth from now on; the old set is not read again.
        raw.edit().putStringSet(NavTabPrefs.KEY_LEGACY_TABS, setOf("sleep")).commit()
        assertEquals(listOf("foods", "weight", "supplements"), NavTabPrefs(context).tabs())
    }

    @Test
    fun aFreshInstallReadsTheDefaultsWithoutWriting() {
        assertEquals(NavTabs.DEFAULT, NavTabPrefs(context).tabs())
        assertNull(raw.getString(NavTabPrefs.KEY_TABS, null))
    }

    @Test
    fun tabsAndLandingAreStored() {
        val prefs = NavTabPrefs(context)

        prefs.setTabs(listOf("ai-tasks", "sleep"))
        prefs.setLanding("sleep")

        assertEquals(NavTabPrefs.Config(listOf("ai-tasks", "sleep"), "sleep"), NavTabPrefs(context).read())
    }

    @Test
    fun everyTabCandidateResolvesToADestination() {
        val navController = TestNavHostController(context)
        navController.navigatorProvider.addNavigator(ComposeNavigator())
        navController.graph =
            navController.createGraph(startDestination = Screen.Dashboard.route) {
                bissbilanzDestinations(navController) { NavTabs.DEFAULT }
            }

        NavTabs.CANDIDATES.forEach { route ->
            navController.navigate(route)
            assertEquals(route, navController.currentDestination?.route, "tab route $route went nowhere")
        }
    }
}
