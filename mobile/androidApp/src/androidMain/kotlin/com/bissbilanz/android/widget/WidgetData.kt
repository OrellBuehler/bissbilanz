package com.bissbilanz.android.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.state.getAppWidgetState
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.currentState
import androidx.glance.state.PreferencesGlanceStateDefinition

private val RefreshTickKey = longPreferencesKey("widget_refresh_tick")

/**
 * Redraws every placed instance of [widget] with freshly loaded data.
 *
 * Glance keeps a widget's session alive for a while after drawing it, and `update()`
 * on a live session only recomposes: `provideGlance` does not run again, so anything
 * it read up front (the entries, the signed-in check) would stay as it was. Bumping a
 * state key the content observes makes [provideWidgetData] reload inside the running
 * composition instead.
 */
internal suspend fun refreshWidgets(
    context: Context,
    widget: GlanceAppWidget,
) {
    val ids = GlanceAppWidgetManager(context).getGlanceIds(widget.javaClass)
    ids.forEach { id ->
        updateAppWidgetState(context, id) { prefs -> prefs[RefreshTickKey] = (prefs[RefreshTickKey] ?: 0L) + 1 }
        widget.update(context, id)
    }
}

/**
 * Loads the widget's data once for the first frame, then again every time
 * [refreshWidgets] bumps the tick, keeping the previous frame until the reload lands.
 */
internal suspend fun <T> GlanceAppWidget.provideWidgetData(
    context: Context,
    id: GlanceId,
    load: suspend () -> T,
    content: @Composable (T) -> Unit,
): Nothing {
    // Read before loading: a bump that lands while the first load runs then still
    // differs from it and triggers a second load, rather than being lost.
    val initialTick = getAppWidgetState(context, PreferencesGlanceStateDefinition, id)[RefreshTickKey] ?: 0L
    val initial = load()
    provideContent {
        val tick = currentState<Preferences>()[RefreshTickKey] ?: 0L
        val data by produceState(initial, tick) {
            if (tick != initialTick) value = load()
        }
        content(data)
    }
}
