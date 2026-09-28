package com.bissbilanz.android.util

import com.bissbilanz.api.generated.model.Preferences
import com.bissbilanz.api.generated.model.PreferencesUpdate

/**
 * Dashboard cards that participate in `widgetOrder`. `summary` (the macro rings header)
 * is pinned above this list rather than being a card, and `streaks` has no Android card
 * yet — both drop out of [fromKey] together with any key the app doesn't recognize.
 */
enum class DashboardSection(
    val key: String,
) {
    FASTING("fasting"),
    WATER("water"),
    ACTIVITY("activity"),
    NOTES("notes"),
    CHART("chart"),
    FAVORITES("favorites"),
    RECIPE_SUGGESTIONS("recipe-suggestions"),
    SUPPLEMENTS("supplements"),
    WEIGHT("weight"),
    MEAL_BREAKDOWN("meal-breakdown"),
    TOP_FOODS("top-foods"),
    SLEEP("sleep"),
    DAYLOG("daylog"),
    ;

    companion object {
        fun fromKey(key: String): DashboardSection? = entries.firstOrNull { it.key == key }
    }
}

/** Mirrors `DEFAULT_PREFERENCES.widgetOrder` in the server's `preferences.ts`. */
val DEFAULT_DASHBOARD_WIDGET_ORDER =
    listOf(
        "fasting",
        "water",
        "activity",
        "notes",
        "day-properties",
        "chart",
        "favorites",
        "recipe-suggestions",
        "supplements",
        "weight",
        "meal-breakdown",
        "top-foods",
        "sleep",
        "summary",
        "daylog",
    )

private fun effectiveRawOrder(order: List<String>?): List<String> = order?.takeIf { it.isNotEmpty() } ?: DEFAULT_DASHBOARD_WIDGET_ORDER

/** Legacy combined key, kept in `widgetOrder` for older builds; not a section here. */
private const val LEGACY_DAY_PROPERTIES_KEY = "day-properties"

private val splitDayPropertySections = listOf(DashboardSection.WATER, DashboardSection.ACTIVITY, DashboardSection.NOTES)

/**
 * All reorderable sections in order, for the layout editor. Any section missing from a
 * stale stored order (e.g. one predating a newly added key) is appended at the end, so
 * the editor never hides a section the user would otherwise have no way to reach. The
 * water/activity/notes trio instead lands where the legacy `day-properties` key sits.
 */
fun dashboardSectionOrder(order: List<String>?): List<DashboardSection> {
    val raw = effectiveRawOrder(order)
    val present = raw.mapNotNull(DashboardSection::fromKey)
    val legacyIndex = raw.indexOf(LEGACY_DAY_PROPERTIES_KEY)
    val inserted = if (legacyIndex >= 0) splitDayPropertySections.filter { it !in present } else emptyList()
    val anchored =
        if (inserted.isEmpty()) {
            present
        } else {
            val before = raw.take(legacyIndex).mapNotNull(DashboardSection::fromKey)
            before + inserted + present.drop(before.size)
        }
    val missing = DashboardSection.entries.filter { it !in anchored }
    return anchored + missing
}

/** Sections to actually render on the dashboard, in order, filtered by visibility. */
fun resolveDashboardSections(
    order: List<String>?,
    prefs: Preferences?,
): List<DashboardSection> = dashboardSectionOrder(order).filter { it.isVisible(prefs) }

/** `daylog` has no visibility toggle; everything else defaults to hidden until [prefs] loads. */
fun DashboardSection.isVisible(prefs: Preferences?): Boolean =
    when (this) {
        DashboardSection.FASTING -> prefs?.showFastingWidget == true
        DashboardSection.WATER -> prefs?.showWaterWidget == true
        DashboardSection.ACTIVITY -> prefs?.showActivityWidget == true
        DashboardSection.NOTES -> prefs?.showNotesWidget == true
        DashboardSection.CHART -> prefs?.showChartWidget == true
        DashboardSection.FAVORITES -> prefs?.showFavoritesWidget == true
        DashboardSection.RECIPE_SUGGESTIONS -> prefs?.showRecipeSuggestionsWidget == true
        DashboardSection.SUPPLEMENTS -> prefs?.showSupplementsWidget == true
        DashboardSection.WEIGHT -> prefs?.showWeightWidget == true
        DashboardSection.MEAL_BREAKDOWN -> prefs?.showMealBreakdownWidget == true
        DashboardSection.TOP_FOODS -> prefs?.showTopFoodsWidget == true
        DashboardSection.SLEEP -> prefs?.showSleepWidget == true
        DashboardSection.DAYLOG -> true
    }

/** `null` for [DashboardSection.DAYLOG], which the layout editor renders without a switch. */
fun DashboardSection.visibilityUpdate(value: Boolean): PreferencesUpdate? =
    when (this) {
        DashboardSection.FASTING -> PreferencesUpdate(showFastingWidget = value)
        DashboardSection.WATER -> PreferencesUpdate(showWaterWidget = value)
        DashboardSection.ACTIVITY -> PreferencesUpdate(showActivityWidget = value)
        DashboardSection.NOTES -> PreferencesUpdate(showNotesWidget = value)
        DashboardSection.CHART -> PreferencesUpdate(showChartWidget = value)
        DashboardSection.FAVORITES -> PreferencesUpdate(showFavoritesWidget = value)
        DashboardSection.RECIPE_SUGGESTIONS -> PreferencesUpdate(showRecipeSuggestionsWidget = value)
        DashboardSection.SUPPLEMENTS -> PreferencesUpdate(showSupplementsWidget = value)
        DashboardSection.WEIGHT -> PreferencesUpdate(showWeightWidget = value)
        DashboardSection.MEAL_BREAKDOWN -> PreferencesUpdate(showMealBreakdownWidget = value)
        DashboardSection.TOP_FOODS -> PreferencesUpdate(showTopFoodsWidget = value)
        DashboardSection.SLEEP -> PreferencesUpdate(showSleepWidget = value)
        DashboardSection.DAYLOG -> null
    }

private val editableDashboardKeys = DashboardSection.entries.map { it.key }.toSet()

/**
 * Rebuilds the full `widgetOrder` payload after a drag in the layout editor. Keys the
 * editor doesn't show (`summary`, `streaks`, or anything future/unknown) keep their
 * original slot; [newVisibleOrder] fills the remaining, editable slots in its own new
 * order. The web reads the same list, so nothing here may be dropped.
 */
fun applyDashboardReorder(
    originalOrder: List<String>?,
    newVisibleOrder: List<DashboardSection>,
): List<PreferencesUpdate.WidgetOrder> {
    val replacements = newVisibleOrder.iterator()
    val rebuilt =
        effectiveRawOrder(originalOrder).map { key ->
            if (key in editableDashboardKeys) replacements.next().key else key
        }
    val leftover = replacements.asSequence().map { it.key }.toList()
    return (rebuilt + leftover).mapNotNull { key -> PreferencesUpdate.WidgetOrder.entries.firstOrNull { it.value == key } }
}
