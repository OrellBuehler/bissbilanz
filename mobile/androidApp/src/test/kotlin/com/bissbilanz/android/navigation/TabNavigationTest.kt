package com.bissbilanz.android.navigation

import android.app.Application
import android.content.Context
import androidx.navigation.compose.ComposeNavigator
import androidx.navigation.createGraph
import androidx.navigation.testing.TestNavHostController
import androidx.test.core.app.ApplicationProvider
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * A tab destination shows no back arrow and keeps the bar exactly while it is on the bar
 * ([NavTabs.isTabRoot]). That only holds if a destination on the bar is never pushed as a
 * second copy, so these walk real back stacks through the app's graph.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = TabNavigationTest.TestApp::class)
class TabNavigationTest {
    class TestApp : Application()

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private val visibleTabs = listOf("foods", "weight")
    private val barRoutes = NavTabs.barRoutes(visibleTabs)

    private fun navController(): TestNavHostController {
        val navController = TestNavHostController(context)
        navController.navigatorProvider.addNavigator(ComposeNavigator())
        navController.graph =
            navController.createGraph(startDestination = Screen.Dashboard.route) {
                bissbilanzDestinations(navController) { visibleTabs }
            }
        return navController
    }

    private fun TestNavHostController.topRoutes(): List<String?> =
        listOf(previousBackStackEntry?.destination?.route, currentBackStackEntry?.destination?.route)

    @Test
    fun aBarDestinationOpenedFromADeeperScreenLandsOnItsTabRoot() {
        val nav = navController()
        nav.selectTab("foods")
        nav.navigate("food/apple")

        nav.openDestination("weight", barRoutes)

        assertEquals(listOf("dashboard", "weight"), nav.topRoutes())
        assertTrue(NavTabs.isTabRoot(nav.currentDestination?.route, visibleTabs))
    }

    @Test
    fun anExternalRouteToATabWithADeeperSavedStackShowsTheTabRoot() {
        val nav = navController()
        nav.selectTab("foods")
        nav.navigate("food/apple")
        nav.selectTab("dashboard")

        nav.openDestination("foods", barRoutes)

        assertEquals(listOf("dashboard", "foods"), nav.topRoutes())
    }

    @Test
    fun anExternalRouteToTheTabOnScreenDropsItsDeeperScreen() {
        val nav = navController()
        nav.selectTab("foods")
        nav.navigate("food/apple")

        nav.openDestination("foods", barRoutes)

        assertEquals(listOf("dashboard", "foods"), nav.topRoutes())
    }

    @Test
    fun aBarTapStillRestoresTheTabsDeeperScreen() {
        val nav = navController()
        nav.selectTab("foods")
        nav.navigate("food/apple")
        nav.selectTab("dashboard")

        nav.selectTab("foods")

        assertEquals("food/{foodId}", nav.currentDestination?.route)
    }

    @Test
    fun aDestinationOffTheBarIsPushedWithABackArrowAndNoBar() {
        val nav = navController()
        nav.selectTab("settings")

        nav.openDestination("sleep", barRoutes)

        assertEquals(listOf("settings", "sleep"), nav.topRoutes())
        assertFalse(NavTabs.isTabRoot(nav.currentDestination?.route, visibleTabs))
    }

    /**
     * The guard behind [NavTabs.isTabRoot]: a plain `navigate("weight")` would push a copy
     * of a destination that may be on the bar, which then shows the bar and no back arrow
     * on top of another screen.
     */
    @Test
    fun noScreenPushesATabDestinationDirectly() {
        val sources = File(moduleRoot(), "src/androidMain/kotlin")
        val candidates = NavTabs.CANDIDATES.joinToString("|") { Regex.escape(it) }
        val plainNavigate = Regex("""\.navigate\(\s*"($candidates)"""")
        val offenders =
            sources
                .walkTopDown()
                .filter { it.extension == "kt" }
                .flatMap { file ->
                    file.readLines().mapIndexedNotNull { index, line ->
                        if (plainNavigate.containsMatchIn(line)) "${file.relativeTo(sources)}:${index + 1}: ${line.trim()}" else null
                    }
                }.toList()

        assertTrue(offenders.isEmpty(), "use openDestination for tab destinations:\n${offenders.joinToString("\n")}")
    }

    private fun moduleRoot(): File {
        var dir: File? = File(".").absoluteFile
        while (dir != null) {
            if (File(dir, "src/androidMain/res/values/strings.xml").isFile) return dir
            dir = dir.parentFile
        }
        error("could not locate the androidApp module from ${File(".").absolutePath}")
    }
}
