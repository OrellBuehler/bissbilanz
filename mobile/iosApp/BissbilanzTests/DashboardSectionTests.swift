@testable import Bissbilanz
import Foundation
import Testing

@Suite("Dashboard Section Tests")
struct DashboardSectionTests {
    private func makePreferences(
        showFastingWidget: Bool = true,
        showDayPropertiesWidget: Bool = true,
        showWaterWidget: Bool = true,
        showActivityWidget: Bool = true,
        showNotesWidget: Bool = true,
        showRecipeSuggestionsWidget: Bool = true,
        showChartWidget: Bool = true,
        showFavoritesWidget: Bool = true,
        showSupplementsWidget: Bool = true,
        showWeightWidget: Bool = true,
        showMealBreakdownWidget: Bool = true,
        showTopFoodsWidget: Bool = true,
        showSleepWidget: Bool = true,
        widgetOrder: [String] = [],
        hidingDayCards: Bool = false
    ) -> Preferences {
        return Preferences(
            showChartWidget: showChartWidget,
            showFavoritesWidget: showFavoritesWidget,
            showSupplementsWidget: showSupplementsWidget,
            showWeightWidget: showWeightWidget,
            showMealBreakdownWidget: showMealBreakdownWidget,
            showTopFoodsWidget: showTopFoodsWidget,
            showSleepWidget: showSleepWidget,
            showFastingWidget: showFastingWidget,
            showDayPropertiesWidget: showDayPropertiesWidget,
            showWaterWidget: showWaterWidget && !hidingDayCards,
            showActivityWidget: showActivityWidget && !hidingDayCards,
            showNotesWidget: showNotesWidget && !hidingDayCards,
            showRecipeSuggestionsWidget: showRecipeSuggestionsWidget,
            widgetOrder: widgetOrder,
            startPage: "dashboard",
            favoriteTapAction: "instant",
            favoriteMealAssignmentMode: "time_based",
            visibleNutrients: [],
            locale: nil,
            timeZone: nil
        )
    }

    @Test("Empty widgetOrder falls back to the server default, minus summary")
    func emptyOrderUsesDefault() {
        let sections = DashboardSection.resolve(order: [], preferences: makePreferences())
        #expect(sections == [
            .fasting, .water, .activity, .notes, .chart, .favorites, .recipeSuggestions, .supplements,
            .weight, .mealBreakdown, .topFoods, .sleep, .daylog,
        ])
    }

    @Test("Explicit widgetOrder is respected verbatim")
    func explicitOrderIsRespected() {
        let order = ["sleep", "weight", "chart", "daylog"]
        let sections = DashboardSection.resolve(order: order, preferences: makePreferences(hidingDayCards: true))
        #expect(sections == [.sleep, .weight, .chart, .daylog])
    }

    @Test("summary and streaks never render, wherever they sit in the order")
    func summaryAndStreaksAreDropped() {
        let order = ["summary", "chart", "streaks", "daylog"]
        let sections = DashboardSection.resolve(order: order, preferences: makePreferences(hidingDayCards: true))
        #expect(sections == [.chart, .daylog])
    }

    @Test("Unknown keys are ignored instead of crashing")
    func unknownKeysAreIgnored() {
        let order = ["chart", "some-future-widget", "daylog"]
        let sections = DashboardSection.resolve(order: order, preferences: makePreferences(hidingDayCards: true))
        #expect(sections == [.chart, .daylog])
    }

    @Test("Sections hidden behind their toggle are excluded, preserving relative order")
    func disabledTogglesAreExcluded() {
        let preferences = makePreferences(showChartWidget: false, showWeightWidget: false, hidingDayCards: true)
        let order = ["fasting", "chart", "weight", "sleep", "daylog"]
        let sections = DashboardSection.resolve(order: order, preferences: preferences)
        #expect(sections == [.fasting, .sleep, .daylog])
    }

    @Test("daylog always renders even with every toggle off")
    func daylogAlwaysRenders() {
        let preferences = makePreferences(
            showFastingWidget: false,
            showDayPropertiesWidget: false,
            showWaterWidget: false,
            showActivityWidget: false,
            showNotesWidget: false,
            showRecipeSuggestionsWidget: false,
            showChartWidget: false,
            showFavoritesWidget: false,
            showSupplementsWidget: false,
            showWeightWidget: false,
            showMealBreakdownWidget: false,
            showTopFoodsWidget: false,
            showSleepWidget: false
        )
        let sections = DashboardSection.resolve(order: DashboardSection.defaultOrder, preferences: preferences)
        #expect(sections == [.daylog])
    }

    @Test("fasting and the three day cards gate their own sections")
    func newTogglesGateTheirSections() {
        let order = ["fasting", "water", "activity", "notes", "day-properties", "daylog"]
        let hidden = makePreferences(
            showFastingWidget: false,
            showWaterWidget: false,
            showActivityWidget: false,
            showNotesWidget: false
        )
        #expect(DashboardSection.resolve(order: order, preferences: hidden) == [.daylog])

        let shown = makePreferences()
        #expect(DashboardSection.resolve(order: order, preferences: shown) == [
            .fasting, .water, .activity, .notes, .daylog,
        ])

        let onlyActivity = makePreferences(showWaterWidget: false, showNotesWidget: false)
        #expect(DashboardSection.resolve(order: order, preferences: onlyActivity) == [
            .fasting, .activity, .daylog,
        ])
    }

    @Test("The day-properties placeholder never renders, even with the legacy toggle on")
    func dayPropertiesPlaceholderNeverRenders() {
        let order = ["day-properties", "chart", "daylog"]
        let preferences = makePreferences(showDayPropertiesWidget: true, hidingDayCards: true)
        #expect(DashboardSection.resolve(order: order, preferences: preferences) == [.chart, .daylog])
    }

    @Test("Water, activity and notes reorder independently")
    func dayCardsReorderIndependently() {
        let order = ["notes", "chart", "water", "day-properties", "activity", "daylog"]
        #expect(DashboardSection.resolve(order: order, preferences: makePreferences()) == [
            .notes, .chart, .water, .activity, .daylog,
        ])
    }

    @Test("Missing day cards are inserted at the day-properties placeholder")
    func missingDayCardsInsertedAtPlaceholder() {
        let order = ["fasting", "day-properties", "chart", "daylog"]
        #expect(DashboardSection.normalizedOrder(order) == [
            "fasting", "water", "activity", "notes", "day-properties", "chart", "daylog",
        ])
        #expect(DashboardSection.resolve(order: order, preferences: makePreferences()) == [
            .fasting, .water, .activity, .notes, .chart, .daylog,
        ])
    }

    @Test("Only the missing day cards are inserted, keeping the ones already placed")
    func onlyMissingDayCardsInserted() {
        let order = ["notes", "day-properties", "chart"]
        #expect(DashboardSection.normalizedOrder(order) == [
            "notes", "water", "activity", "day-properties", "chart",
        ])
    }

    @Test("Without a placeholder, missing day cards follow fasting, else lead the order")
    func missingDayCardsWithoutPlaceholder() {
        #expect(DashboardSection.normalizedOrder(["chart", "fasting", "daylog"]) == [
            "chart", "fasting", "water", "activity", "notes", "daylog",
        ])
        #expect(DashboardSection.normalizedOrder(["chart", "daylog"]) == [
            "water", "activity", "notes", "chart", "daylog",
        ])
    }

    @Test("A complete order, including the placeholder and unknown keys, is returned untouched")
    func completeOrderRoundTrips() {
        let order = ["fasting", "water", "day-properties", "activity", "some-future-widget", "notes", "daylog"]
        #expect(DashboardSection.normalizedOrder(order) == order)
    }

    @Test("An empty order normalizes to the default order, placeholder included")
    func emptyOrderNormalizesToDefault() {
        #expect(DashboardSection.normalizedOrder([]) == DashboardSection.defaultOrder)
        #expect(DashboardSection.defaultOrder.contains("day-properties"))
        #expect(DashboardSection.defaultOrder == [
            "fasting", "water", "activity", "notes", "day-properties", "chart", "favorites",
            "recipe-suggestions", "supplements", "weight", "meal-breakdown", "top-foods", "sleep",
            "summary", "daylog",
        ])
    }

    @Test("recipeSuggestions toggle gates its section")
    func recipeSuggestionsToggleGatesItsSection() {
        let hidden = makePreferences(showRecipeSuggestionsWidget: false, hidingDayCards: true)
        let order = ["recipe-suggestions", "daylog"]
        #expect(DashboardSection.resolve(order: order, preferences: hidden) == [.daylog])

        let shown = makePreferences(hidingDayCards: true)
        #expect(DashboardSection.resolve(order: order, preferences: shown) == [.recipeSuggestions, .daylog])
    }

    @Test("isDashboardCard and hasVisibilityToggle are correct per case")
    func layoutRowFlags() {
        #expect(DashboardSection.summary.isDashboardCard == false)
        #expect(DashboardSection.streaks.isDashboardCard == false)
        #expect(DashboardSection.daylog.isDashboardCard == true)
        #expect(DashboardSection.daylog.hasVisibilityToggle == false)
        #expect(DashboardSection.chart.hasVisibilityToggle == true)
        #expect(DashboardSection.fasting.hasVisibilityToggle == true)
        #expect(DashboardSection.dayProperties.isDashboardCard == false)
        #expect(DashboardSection.dayProperties.hasVisibilityToggle == false)
        #expect(DashboardSection.water.isDashboardCard == true)
        #expect(DashboardSection.water.hasVisibilityToggle == true)
        #expect(DashboardSection.activity.hasVisibilityToggle == true)
        #expect(DashboardSection.notes.hasVisibilityToggle == true)
        #expect(DashboardSection.recipeSuggestions.hasVisibilityToggle == true)
    }

    @Test("applyVisibility writes the matching PreferencesUpdate field")
    func applyVisibilityWritesMatchingField() {
        var update = PreferencesUpdate()
        DashboardSection.fasting.applyVisibility(false, to: &update)
        #expect(update.showFastingWidget == false)

        var waterUpdate = PreferencesUpdate()
        DashboardSection.water.applyVisibility(false, to: &waterUpdate)
        #expect(waterUpdate.showWaterWidget == false)
        #expect(waterUpdate.showActivityWidget == nil)
        #expect(waterUpdate.showDayPropertiesWidget == nil)

        var activityUpdate = PreferencesUpdate()
        DashboardSection.activity.applyVisibility(true, to: &activityUpdate)
        #expect(activityUpdate.showActivityWidget == true)

        var notesUpdate = PreferencesUpdate()
        DashboardSection.notes.applyVisibility(false, to: &notesUpdate)
        #expect(notesUpdate.showNotesWidget == false)

        var placeholderUpdate = PreferencesUpdate()
        DashboardSection.dayProperties.applyVisibility(false, to: &placeholderUpdate)
        #expect(placeholderUpdate.showDayPropertiesWidget == nil)

        var recipeSuggestionsUpdate = PreferencesUpdate()
        DashboardSection.recipeSuggestions.applyVisibility(false, to: &recipeSuggestionsUpdate)
        #expect(recipeSuggestionsUpdate.showRecipeSuggestionsWidget == false)

        var noopUpdate = PreferencesUpdate()
        DashboardSection.daylog.applyVisibility(false, to: &noopUpdate)
        #expect(noopUpdate.showChartWidget == nil)
        #expect(noopUpdate.showFastingWidget == nil)
    }
}
