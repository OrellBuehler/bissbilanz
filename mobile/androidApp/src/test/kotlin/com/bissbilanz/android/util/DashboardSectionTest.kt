package com.bissbilanz.android.util

import com.bissbilanz.api.generated.model.Preferences
import com.bissbilanz.api.generated.model.PreferencesUpdate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class DashboardSectionTest {
    private fun preferences(
        widgetOrder: List<String> = DEFAULT_DASHBOARD_WIDGET_ORDER,
        showFastingWidget: Boolean = true,
        showDayPropertiesWidget: Boolean = true,
        showChartWidget: Boolean = true,
        showFavoritesWidget: Boolean = true,
        showRecipeSuggestionsWidget: Boolean = true,
        showSupplementsWidget: Boolean = true,
        showWeightWidget: Boolean = true,
        showMealBreakdownWidget: Boolean = true,
        showTopFoodsWidget: Boolean = true,
        showSleepWidget: Boolean = true,
    ) = Preferences(
        showChartWidget = showChartWidget,
        showFavoritesWidget = showFavoritesWidget,
        showRecipeSuggestionsWidget = showRecipeSuggestionsWidget,
        showSupplementsWidget = showSupplementsWidget,
        showWeightWidget = showWeightWidget,
        showMealBreakdownWidget = showMealBreakdownWidget,
        showTopFoodsWidget = showTopFoodsWidget,
        showSleepWidget = showSleepWidget,
        showFastingWidget = showFastingWidget,
        showDayPropertiesWidget = showDayPropertiesWidget,
        widgetOrder = widgetOrder,
        mealOrder = emptyList(),
        startPage = "dashboard",
        favoriteTapAction = "instant",
        favoriteMealAssignmentMode = "time_based",
        visibleNutrients = emptyList(),
        waterGoalMl = 2000,
        locale = null,
        timeZone = "UTC",
        favoriteMealTimeframes = emptyList(),
        activityGoalAdjustment = false,
        activityCreditPercent = 100,
    )

    @Test
    fun fromKeyIgnoresSummaryStreaksAndUnknownKeys() {
        assertEquals(null, DashboardSection.fromKey("summary"))
        assertEquals(null, DashboardSection.fromKey("streaks"))
        assertEquals(null, DashboardSection.fromKey("bogus"))
        assertEquals(DashboardSection.CHART, DashboardSection.fromKey("chart"))
    }

    @Test
    fun resolveDashboardSectionsFollowsTheStoredOrderAndVisibility() {
        val prefs =
            preferences(
                widgetOrder =
                    listOf(
                        "daylog",
                        "chart",
                        "fasting",
                        "summary",
                        "weight",
                        "sleep",
                        "streaks",
                        "top-foods",
                        "meal-breakdown",
                        "supplements",
                        "favorites",
                        "recipe-suggestions",
                        "day-properties",
                    ),
                showFastingWidget = false,
                showSleepWidget = false,
            )

        assertEquals(
            listOf(
                DashboardSection.DAYLOG,
                DashboardSection.CHART,
                DashboardSection.WEIGHT,
                DashboardSection.TOP_FOODS,
                DashboardSection.MEAL_BREAKDOWN,
                DashboardSection.SUPPLEMENTS,
                DashboardSection.FAVORITES,
                DashboardSection.RECIPE_SUGGESTIONS,
                DashboardSection.DAY_PROPERTIES,
            ),
            resolveDashboardSections(prefs.widgetOrder, prefs),
        )
    }

    @Test
    fun resolveDashboardSectionsHidesEverythingButDaylogWhenPrefsAreNull() {
        assertEquals(listOf(DashboardSection.DAYLOG), resolveDashboardSections(null, null))
    }

    @Test
    fun dashboardSectionOrderAppendsSectionsMissingFromAStaleStoredOrder() {
        val order = dashboardSectionOrder(listOf("daylog", "chart"))

        assertEquals(DashboardSection.entries.size, order.size)
        assertEquals(DashboardSection.DAYLOG, order[0])
        assertEquals(DashboardSection.CHART, order[1])
    }

    @Test
    fun dashboardSectionOrderUsesTheServerDefaultWhenEmptyOrNull() {
        val expected =
            listOf(
                DashboardSection.FASTING,
                DashboardSection.DAY_PROPERTIES,
                DashboardSection.CHART,
                DashboardSection.FAVORITES,
                DashboardSection.RECIPE_SUGGESTIONS,
                DashboardSection.SUPPLEMENTS,
                DashboardSection.WEIGHT,
                DashboardSection.MEAL_BREAKDOWN,
                DashboardSection.TOP_FOODS,
                DashboardSection.SLEEP,
                DashboardSection.DAYLOG,
            )

        assertEquals(expected, dashboardSectionOrder(emptyList()))
        assertEquals(expected, dashboardSectionOrder(null))
    }

    @Test
    fun visibilityUpdateIsNullForDaylogAndSetsTheRightFieldOtherwise() {
        assertNull(DashboardSection.DAYLOG.visibilityUpdate(true))
        assertEquals(PreferencesUpdate(showSleepWidget = false), DashboardSection.SLEEP.visibilityUpdate(false))
        assertEquals(PreferencesUpdate(showFastingWidget = true), DashboardSection.FASTING.visibilityUpdate(true))
        assertEquals(
            PreferencesUpdate(showRecipeSuggestionsWidget = false),
            DashboardSection.RECIPE_SUGGESTIONS.visibilityUpdate(false),
        )
    }

    @Test
    fun applyDashboardReorderKeepsHiddenKeysInPlace() {
        val original = listOf("fasting", "day-properties", "chart", "summary", "sleep", "daylog")
        val newVisibleOrder =
            listOf(
                DashboardSection.SLEEP,
                DashboardSection.FASTING,
                DashboardSection.DAY_PROPERTIES,
                DashboardSection.CHART,
                DashboardSection.DAYLOG,
            )

        val result = applyDashboardReorder(original, newVisibleOrder)

        assertEquals(
            listOf(
                PreferencesUpdate.WidgetOrder.sleep,
                PreferencesUpdate.WidgetOrder.fasting,
                PreferencesUpdate.WidgetOrder.dayMinusProperties,
                PreferencesUpdate.WidgetOrder.summary,
                PreferencesUpdate.WidgetOrder.chart,
                PreferencesUpdate.WidgetOrder.daylog,
            ),
            result,
        )
    }

    @Test
    fun applyDashboardReorderAppendsSectionsNotInTheOriginalOrder() {
        val original = listOf("chart", "summary")
        val newVisibleOrder = listOf(DashboardSection.CHART, DashboardSection.SLEEP)

        val result = applyDashboardReorder(original, newVisibleOrder)

        assertEquals(
            listOf(
                PreferencesUpdate.WidgetOrder.chart,
                PreferencesUpdate.WidgetOrder.summary,
                PreferencesUpdate.WidgetOrder.sleep,
            ),
            result,
        )
    }

    @Test
    fun applyDashboardReorderFallsBackToTheServerDefaultWhenOriginalIsEmpty() {
        val newVisibleOrder = dashboardSectionOrder(null)

        val result = applyDashboardReorder(emptyList(), newVisibleOrder)

        assertEquals(
            DEFAULT_DASHBOARD_WIDGET_ORDER.mapNotNull { key -> PreferencesUpdate.WidgetOrder.entries.firstOrNull { it.value == key } },
            result,
        )
    }
}
