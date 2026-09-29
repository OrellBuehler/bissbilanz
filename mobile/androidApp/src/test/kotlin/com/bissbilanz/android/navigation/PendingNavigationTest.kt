package com.bissbilanz.android.navigation

import android.app.Application
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals
import kotlin.test.assertNull

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [31], application = PendingNavigationTest.TestApp::class)
class PendingNavigationTest {
    class TestApp : Application()

    @get:Rule
    val composeTestRule = createComposeRule()

    @Before
    fun clearPendingRoute() {
        PendingNavigation.route.value?.let { PendingNavigation.consume(it) }
        PendingNavigation.consumeFoodQuery()
        PendingLogConfirmation.consume()
        PendingPackageImport.request.value?.let { PendingPackageImport.consume(it) }
    }

    @Test
    fun routeRequestedBeforeTheNavHostExistsStillNavigates() {
        // What a launcher shortcut does: MainActivity reads the intent in onCreate,
        // long before there is a nav host to receive the route.
        PendingNavigation.request("scanner")

        composeTestRule.setContent { NavShell() }
        awaitText("scanner screen")

        composeTestRule.onNodeWithText("scanner screen").assertIsDisplayed()
        assertNull(PendingNavigation.route.value)
    }

    @Test
    fun routeRequestedWhileTheAppIsRunningNavigates() {
        composeTestRule.setContent { NavShell() }
        awaitText("dashboard screen")

        PendingNavigation.request("weight")
        awaitText("weight screen")

        composeTestRule.onNodeWithText("weight screen").assertIsDisplayed()
    }

    @Test
    fun theSameRouteCanBeRequestedAgainAfterItWasConsumed() {
        composeTestRule.setContent { NavShell() }
        awaitText("dashboard screen")

        PendingNavigation.request("weight")
        awaitText("weight screen")

        PendingNavigation.request("scanner")
        awaitText("scanner screen")

        PendingNavigation.request("weight")
        awaitText("weight screen")
    }

    @Test
    fun requestFoodSearchQueuesTheRouteAndTheQuery() {
        PendingNavigation.requestFoodSearch("banana")

        assertEquals("foods", PendingNavigation.route.value)
        assertEquals("banana", PendingNavigation.consumeFoodQuery())
        // Claimed once; a second read finds nothing left to consume.
        assertNull(PendingNavigation.consumeFoodQuery())
    }

    @Test
    fun pendingLogConfirmationIsClearedOnceConsumed() {
        PendingLogConfirmation.request("entry-1", "Logged Banana")

        val confirmation = PendingLogConfirmation.confirmation.value
        assertEquals("entry-1", confirmation?.entryId)
        assertEquals("Logged Banana", confirmation?.message)

        PendingLogConfirmation.consume()
        assertNull(PendingLogConfirmation.confirmation.value)
    }

    @Test
    fun aSharedFoodPackageOpensTheImportScreenEvenBeforeTheNavHostExists() {
        // What tapping a .bissbilanz file does on a cold start: the intent is read in onCreate.
        PendingPackageImport.request(PendingPackageImport.Request("Lasagne.bissbilanz", "/cache/incoming/a.pkg"))

        composeTestRule.setContent { NavShell() }
        awaitText("package screen")

        composeTestRule.onNodeWithText("package screen").assertIsDisplayed()
    }

    @Test
    fun aSharedFoodPackageOpensTheImportScreenWhileTheAppIsRunning() {
        composeTestRule.setContent { NavShell() }
        awaitText("dashboard screen")

        PendingPackageImport.request(PendingPackageImport.Request("Lasagne.bissbilanz", "/cache/incoming/a.pkg"))
        awaitText("package screen")
    }

    @Test
    fun aFoodPackageRequestStaysUntilTheImportScreenClaimsIt() {
        val request = PendingPackageImport.Request("Lasagne.bissbilanz", "/cache/incoming/a.pkg")
        PendingPackageImport.request(request)
        assertEquals(request, PendingPackageImport.request.value)

        // A newer file replaced it: consuming the old one must not drop the new one.
        val newer = PendingPackageImport.Request("Pizza.bissbilanz", "/cache/incoming/b.pkg")
        PendingPackageImport.request(newer)
        PendingPackageImport.consume(request)
        assertEquals(newer, PendingPackageImport.request.value)

        PendingPackageImport.consume(newer)
        assertNull(PendingPackageImport.request.value)
    }

    private fun awaitText(text: String) {
        composeTestRule.waitUntil(timeoutMillis = 5_000) {
            composeTestRule.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty()
        }
    }

    /**
     * Mirrors the real shell: the handler sits outside a Scaffold whose body — the nav
     * host — is subcomposed during layout, so the graph is not there on the first frame.
     */
    @Composable
    private fun NavShell() {
        val navController = rememberNavController()
        PendingNavigationHandler(navController)
        Scaffold { innerPadding ->
            NavHost(
                navController = navController,
                startDestination = "dashboard",
                modifier = Modifier.padding(innerPadding),
            ) {
                composable("dashboard") { Text("dashboard screen") }
                composable("scanner") { Text("scanner screen") }
                composable("weight") { Text("weight screen") }
                composable("food-package-import") { Text("package screen") }
            }
        }
    }
}
