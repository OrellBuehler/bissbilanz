package com.bissbilanz.android.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.navigation.NavController
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * A route asked for from outside the Compose tree: a launcher shortcut, a widget or a
 * notification.
 *
 * The request has to outlive the trip through the UI. MainActivity reads it out of the
 * intent in `onCreate`, before `setContent`, and on a cold start the nav host is still
 * several steps away — auth has to resolve before [AppNavigation] is composed at all. An
 * event stream drops what it emits while nobody is subscribed, which is why the
 * long-press launcher shortcuts did nothing but open the app. Holding the route until
 * someone consumes it is what makes them land on their screen.
 */
object PendingNavigation {
    private val _route = MutableStateFlow<String?>(null)
    val route: StateFlow<String?> = _route.asStateFlow()

    private val pendingFoodQuery = MutableStateFlow<String?>(null)

    /**
     * The query [requestFoodSearch] queued, observed rather than read once: with Foods
     * already open the single-top navigation keeps the same screen, which would never
     * look again.
     */
    val foodQuery: StateFlow<String?> = pendingFoodQuery.asStateFlow()

    fun request(route: String) {
        _route.value = route
    }

    /** Clears [route], unless a newer request already replaced it. */
    fun consume(route: String) {
        _route.compareAndSet(route, null)
    }

    /**
     * Sends the app to food search prefilled with [query] — the fallback when an
     * Assistant utterance or shortcut names a food that doesn't match anything in
     * the user's own database. [request] alone would land on a blank search box, so
     * the query rides alongside it for `FoodSearchScreen` to claim with
     * [consumeFoodQuery].
     */
    fun requestFoodSearch(query: String) {
        pendingFoodQuery.value = query
        request("foods")
    }

    /** Claims the query [requestFoodSearch] queued, if it hasn't been read yet. */
    fun consumeFoodQuery(): String? {
        val query = pendingFoodQuery.value
        pendingFoodQuery.value = null
        return query
    }
}

/**
 * A one-shot "you just logged this" snackbar, queued alongside a [PendingNavigation]
 * request to the day log. An Assistant / shortcut log always lands on the day log
 * through a fresh navigation, so — unlike an in-screen quick-log — there is no
 * `SnackbarHostState` around yet to show the confirmation on until that screen mounts.
 */
object PendingLogConfirmation {
    data class Confirmation(
        val entryId: String,
        val message: String,
    )

    private val _confirmation = MutableStateFlow<Confirmation?>(null)
    val confirmation: StateFlow<Confirmation?> = _confirmation.asStateFlow()

    fun request(
        entryId: String,
        message: String,
    ) {
        _confirmation.value = Confirmation(entryId, message)
    }

    fun consume() {
        _confirmation.value = null
    }
}

/**
 * The tab a fresh start opens on ("Open app on"). It is taken once; the flag is saved, so a
 * recreated activity (rotation, process death) keeps the back stack it restored instead.
 */
@Stable
class LandingTab internal constructor(
    private val taken: MutableState<Boolean>,
    private val route: String,
) {
    /** Until it is taken, the app would show Home first: the shell stays hidden meanwhile. */
    val pending: Boolean get() = !taken.value && route != NavTabs.HOME

    /** The landing entry while switching to it is the transition on screen, run without animation. */
    var entryId: String? by mutableStateOf(null)
        internal set

    internal fun take(): String? {
        if (taken.value) return null
        taken.value = true
        return route.takeIf { it != NavTabs.HOME }
    }
}

@Composable
fun rememberLandingTab(route: () -> String): LandingTab {
    val taken = rememberSaveable { mutableStateOf(false) }
    return remember { LandingTab(taken, if (taken.value) NavTabs.HOME else route()) }
}

/**
 * Sends the app to any route [PendingNavigation] is holding, once [navController] can
 * take it. A route on the bar ([barRoutes]) selects its tab rather than stacking a copy.
 *
 * The [landing] tab is applied first, unless an entry point already asked for a route.
 */
@Composable
fun PendingNavigationHandler(
    navController: NavController,
    barRoutes: () -> List<String> = { emptyList() },
    landing: LandingTab? = null,
) {
    LaunchedEffect(navController) {
        // Material's Scaffold subcomposes its body during layout, so the nav host — and
        // with it the graph — does not exist yet when this effect first runs. Navigating
        // then throws. The first back stack entry is the signal that the host is up.
        navController.currentBackStackEntryFlow.first()
        val landingRoute = landing?.take()
        if (landing != null && landingRoute != null && PendingNavigation.route.value == null) {
            navController.selectTab(landingRoute)
            landing.entryId = navController.currentBackStackEntry?.id
            launch {
                navController.currentBackStackEntryFlow.drop(1).first()
                landing.entryId = null
            }
        }
        // A shared food package: the import screen claims the request itself once it is up.
        launch {
            PendingPackageImport.request.filterNotNull().collect {
                navController.navigate("food-package-import") {
                    launchSingleTop = true
                }
            }
        }
        PendingNavigation.route.filterNotNull().collect { route ->
            // Cleared before the jump, so a route that cannot be navigated to is dropped
            // rather than retried on every recomposition.
            PendingNavigation.consume(route)
            navController.openDestination(route, barRoutes())
        }
    }
}
