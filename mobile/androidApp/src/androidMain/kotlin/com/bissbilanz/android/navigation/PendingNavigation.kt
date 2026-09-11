package com.bissbilanz.android.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.navigation.NavController
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first

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
 * Sends the app to any route [PendingNavigation] is holding, once [navController] can
 * take it.
 */
@Composable
fun PendingNavigationHandler(navController: NavController) {
    LaunchedEffect(navController) {
        // Material's Scaffold subcomposes its body during layout, so the nav host — and
        // with it the graph — does not exist yet when this effect first runs. Navigating
        // then throws. The first back stack entry is the signal that the host is up.
        navController.currentBackStackEntryFlow.first()
        PendingNavigation.route.filterNotNull().collect { route ->
            // Cleared before the jump, so a route that cannot be navigated to is dropped
            // rather than retried on every recomposition.
            PendingNavigation.consume(route)
            navController.navigate(route) {
                launchSingleTop = true
            }
        }
    }
}
