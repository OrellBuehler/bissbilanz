package com.bissbilanz.android.widget

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalContext
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.cornerRadius
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.padding
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import com.bissbilanz.android.MainActivity
import com.bissbilanz.android.R
import com.bissbilanz.android.ui.AppLanguage
import com.bissbilanz.api.generated.model.Preferences
import com.bissbilanz.auth.AuthManager
import com.bissbilanz.mode.AppModeManager
import com.bissbilanz.userdata.UserDataDatabase
import com.bissbilanz.util.decodeOrNull
import kotlinx.serialization.json.Json

object WidgetRoutes {
    const val SCANNER = "scanner"
    const val FOODS = "foods"
    const val FAVORITES = "favorites"
}

/**
 * The intent for a widget tap that opens the app on [route].
 *
 * It must be handed to Glance's `actionStartActivity`, which turns it into a
 * PendingIntent the launcher fires on the user's tap. Starting the same intent from an
 * `ActionCallback` instead does not work: a callback runs in a broadcast receiver with
 * no visible window, which Android's background-activity-start rules silently block.
 */
fun openAppIntent(
    context: Context,
    route: String,
): Intent =
    Intent(context, MainActivity::class.java).apply {
        putExtra(MainActivity.EXTRA_NAVIGATE_TO, route)
    }

/**
 * Whether a tap on a quick-log tile can never log on its own, going by the cached
 * preferences: no meal is ever picked for the user, so the tap has to open the app.
 * Decided when the widget renders because the app can only be opened from a real
 * click action, not from the callback that would otherwise log the food.
 */
internal fun tilesAlwaysAskForMeal(
    db: UserDataDatabase,
    json: Json,
): Boolean = tilesAlwaysAskForMeal(cachedWidgetPreferences(db, json))

internal fun tilesAlwaysAskForMeal(prefs: Preferences?): Boolean = prefs == null || prefs.favoriteMealAssignmentMode == "ask_meal"

internal fun cachedWidgetPreferences(
    db: UserDataDatabase,
    json: Json,
): Preferences? {
    val cached = db.userDataDatabaseQueries.selectPreferences().executeAsOneOrNull()
    return cached?.let { json.decodeOrNull<Preferences>(it.jsonData) }
}

/**
 * Whether the widgets may show and log data: an account is signed in, or the user
 * chose the anonymous Local mode. Read from storage rather than [AuthManager.authState],
 * which stays `Loading` in a process the launcher started for a widget alone.
 */
internal suspend fun widgetsSignedIn(): Boolean {
    val koin =
        org.koin.java.KoinJavaComponent
            .getKoin()
    return koin.get<AppModeManager>().isLocal || koin.get<AuthManager>().getAccessToken() != null
}

/** The Glance context with the in-app language applied, which the application context lacks below API 33. */
@Composable
internal fun localizedContext(): Context {
    val context = LocalContext.current
    return remember(context) { AppLanguage.localized(context) }
}

/** What every data widget shows after a logout: no numbers, one tap into the app. */
@Composable
internal fun SignedOutWidgetContent() {
    val context = localizedContext()
    Box(
        modifier =
            GlanceModifier
                .fillMaxSize()
                .cornerRadius(16.dp)
                .background(GlanceTheme.colors.background)
                .clickable(actionStartActivity<MainActivity>())
                .padding(8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = context.getString(R.string.widget_signed_out),
            style =
                TextStyle(
                    color = GlanceTheme.colors.onSurfaceVariant,
                    fontSize = 12.sp,
                    textAlign = TextAlign.Center,
                ),
            maxLines = 3,
        )
    }
}
