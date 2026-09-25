package com.bissbilanz.android.tips

import android.content.Context
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import com.bissbilanz.android.ui.AppLanguage
import java.util.Locale

/** The fixed slugs the public help center (`bissbilanz.orellbuehler.ch/help/<slug>`) serves. */
object HelpSlugs {
    const val GETTING_STARTED = "getting-started"
    const val LOGGING = "logging"
    const val SCANNING = "scanning"
    const val FOOD_DATABASE = "food-database"
    const val RECIPES = "recipes"
    const val GOALS_MAINTENANCE = "goals-maintenance"
    const val BODY_TRACKING = "body-tracking"
    const val INSIGHTS = "insights"
    const val AI_ASSISTANT = "ai-assistant"
    const val IMPORT_EXPORT = "import-export"
    const val MOBILE_EXTRAS = "mobile-extras"
    const val SYNC_OFFLINE = "sync-offline"
}

private const val HELP_BASE_URL = "https://bissbilanz.orellbuehler.ch"

/**
 * The app's effective language tag, mirroring [AppLanguage]: the stored override, or
 * the device locale when it follows the system.
 */
private fun effectiveLanguage(context: Context): String {
    val tag = AppLanguage.stored(context)
    return if (tag == AppLanguage.SYSTEM) Locale.getDefault().language else tag
}

/**
 * Opens the public help center in a Custom Tab, localized like [launchLoginFlow] in
 * `LoginScreen.kt`. Pass a [slug] for a specific article, or omit it for the index.
 */
fun openHelp(
    context: Context,
    slug: String? = null,
) {
    val prefix = if (effectiveLanguage(context) == "de") "/de" else ""
    val path = if (slug != null) "$prefix/help/$slug" else "$prefix/help"
    CustomTabsIntent.Builder().build().launchUrl(context, Uri.parse("$HELP_BASE_URL$path"))
}
