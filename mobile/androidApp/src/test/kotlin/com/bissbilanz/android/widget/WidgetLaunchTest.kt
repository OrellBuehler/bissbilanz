package com.bissbilanz.android.widget

import android.app.Application
import android.content.Context
import android.content.Intent
import androidx.navigation.compose.ComposeNavigator
import androidx.navigation.createGraph
import androidx.navigation.testing.TestNavHostController
import androidx.test.core.app.ApplicationProvider
import com.bissbilanz.android.MainActivity
import com.bissbilanz.android.navigation.Screen
import com.bissbilanz.android.navigation.bissbilanzDestinations
import com.bissbilanz.android.navigation.takeNavigateRoute
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull

/**
 * A widget tap that opens the app is a chain of plain strings: the route the widget puts
 * on the intent, MainActivity reading it back, and the nav graph owning it. Break any
 * link and the widget just opens the app — or, for a tap launched from a callback,
 * nothing at all — with no error anywhere.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = WidgetLaunchTest.TestApp::class)
class WidgetLaunchTest {
    class TestApp : Application()

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    @Test
    fun theIntentTargetsMainActivityAndCarriesTheRoute() {
        val intent = openAppIntent(context, WidgetRoutes.SCANNER)

        assertEquals(MainActivity::class.java.name, intent.component?.className)
        assertEquals("scanner", intent.getStringExtra(MainActivity.EXTRA_NAVIGATE_TO))
    }

    @Test
    fun mainActivityReadsBackTheRouteTheWidgetSent() {
        val intent = openAppIntent(context, WidgetRoutes.SCANNER)

        assertEquals("scanner", intent.takeNavigateRoute(isFreshLaunch = true))
        assertFalse(intent.hasExtra(MainActivity.EXTRA_NAVIGATE_TO), "the route is consumed once")
        assertNull(intent.takeNavigateRoute(isFreshLaunch = true))
    }

    @Test
    fun aRestoredActivityDoesNotServeTheSameRouteAgain() {
        val intent = openAppIntent(context, WidgetRoutes.SCANNER)

        assertNull(intent.takeNavigateRoute(isFreshLaunch = false))
        assertFalse(intent.hasExtra(MainActivity.EXTRA_NAVIGATE_TO))
    }

    @Test
    fun anIntentWithoutARouteYieldsNothing() {
        assertNull(Intent().takeNavigateRoute(isFreshLaunch = true))
        assertNull(Intent().putExtra(MainActivity.EXTRA_NAVIGATE_TO, " ").takeNavigateRoute(isFreshLaunch = true))
    }

    @Test
    fun everyWidgetRouteResolvesToADestination() {
        val navController = TestNavHostController(context)
        navController.navigatorProvider.addNavigator(ComposeNavigator())
        navController.graph =
            navController.createGraph(startDestination = Screen.Dashboard.route) {
                bissbilanzDestinations(navController)
            }

        listOf(WidgetRoutes.SCANNER, WidgetRoutes.FOODS, WidgetRoutes.FAVORITES).forEach { route ->
            navController.navigate(route)
            assertEquals(route, navController.currentDestination?.route, "widget route $route went nowhere")
        }
    }
}
