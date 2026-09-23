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
    DAY_PROPERTIES("day-properties"),
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

/**
 * All reorderable sections in order, for the layout editor. Any section missing from a
 * stale stored order (e.g. one predating a newly added key) is appended at the end, so
 * the editor never hides a section the user would otherwise have no way to reach.
 */
fun dashboardSectionOrder(order: List<String>?): List<DashboardSection> {
    val present = effectiveRawOrder(order).mapNotNull(DashboardSection::fromKey)
    val missing = DashboardSection.entries.filter { it !in present }
    return present + missing
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
        DashboardSection.DAY_PROPERTIES -> prefs?.showDayPropertiesWidget == true
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
        DashboardSection.DAY_PROPERTIES -> PreferencesUpdate(showDayPropertiesWidget = value)
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
