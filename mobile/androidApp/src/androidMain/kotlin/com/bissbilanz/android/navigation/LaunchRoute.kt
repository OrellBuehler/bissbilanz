package com.bissbilanz.android.navigation

import android.content.Intent
import com.bissbilanz.android.MainActivity

/**
 * Reads the route an entry point (launcher shortcut, widget, notification) asked
 * MainActivity to open, and strips it from the intent so it is only acted on once.
 *
 * A restored activity (rotation, process death) is handed its original launch intent
 * again. That request was already served, so on a restore the route is dropped instead
 * of reopening, say, the barcode scanner the user has since left.
 */
fun Intent.takeNavigateRoute(isFreshLaunch: Boolean): String? {
    val route = getStringExtra(MainActivity.EXTRA_NAVIGATE_TO) ?: return null
    removeExtra(MainActivity.EXTRA_NAVIGATE_TO)
    return route.takeIf { isFreshLaunch && it.isNotBlank() }
}
