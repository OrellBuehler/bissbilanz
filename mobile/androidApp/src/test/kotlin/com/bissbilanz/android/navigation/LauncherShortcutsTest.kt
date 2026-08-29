package com.bissbilanz.android.navigation

import android.app.Application
import android.content.Context
import androidx.navigation.compose.ComposeNavigator
import androidx.navigation.createGraph
import androidx.navigation.testing.TestNavHostController
import androidx.test.core.app.ApplicationProvider
import com.bissbilanz.android.MainActivity
import com.bissbilanz.android.R
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.xmlpull.v1.XmlPullParser
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The long-press quick actions are wired entirely through resources and plain strings,
 * so nothing in the compiler notices when a route is renamed out from under them or a
 * new shortcut ships without one. Both mistakes look the same to the user: the shortcut
 * opens the app and goes nowhere.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = LauncherShortcutsTest.TestApp::class)
class LauncherShortcutsTest {
    class TestApp : Application()

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    @Test
    fun everyShortcutAsksForARoute() {
        val (shortcuts, routes) = parseShortcuts()

        assertTrue(shortcuts > 0, "no shortcuts declared in shortcuts.xml")
        assertEquals(shortcuts, routes.size, "a shortcut is missing its navigate_to extra")
    }

    @Test
    fun everyShortcutRouteResolvesToADestination() {
        val (_, routes) = parseShortcuts()

        val navController = TestNavHostController(context)
        navController.navigatorProvider.addNavigator(ComposeNavigator())
        navController.graph =
            navController.createGraph(startDestination = Screen.Dashboard.route) {
                bissbilanzDestinations(navController)
            }

        routes.forEach { route ->
            navController.navigate(route)
            assertEquals(route, navController.currentDestination?.route, "shortcut route $route went nowhere")
        }
    }

    /** Reads the shipped shortcuts.xml: how many shortcuts, and the routes they ask for. */
    private fun parseShortcuts(): Pair<Int, List<String>> {
        val androidNs = "http://schemas.android.com/apk/res/android"
        val parser = context.resources.getXml(R.xml.shortcuts)
        var shortcuts = 0
        val routes = mutableListOf<String>()
        while (parser.next() != XmlPullParser.END_DOCUMENT) {
            if (parser.eventType != XmlPullParser.START_TAG) continue
            when (parser.name) {
                "shortcut" -> shortcuts++
                "extra" ->
                    if (parser.getAttributeValue(androidNs, "name") == MainActivity.EXTRA_NAVIGATE_TO) {
                        routes += parser.getAttributeValue(androidNs, "value")
                    }
            }
        }
        return shortcuts to routes
    }
}
