@testable import Bissbilanz
import Foundation
import Testing

@Suite("Dashboard Section Tests")
struct DashboardSectionTests {
    private func makePreferences(
        showFastingWidget: Bool = true,
        showDayPropertiesWidget: Bool = true,
        showChartWidget: Bool = true,
        showFavoritesWidget: Bool = true,
        showSupplementsWidget: Bool = true,
        showWeightWidget: Bool = true,
        showMealBreakdownWidget: Bool = true,
        showTopFoodsWidget: Bool = true,
        showSleepWidget: Bool = true,
        widgetOrder: [String] = []
    ) -> Preferences {
        Preferences(
            showChartWidget: showChartWidget,
            showFavoritesWidget: showFavoritesWidget,
            showSupplementsWidget: showSupplementsWidget,
            showWeightWidget: showWeightWidget,
            showMealBreakdownWidget: showMealBreakdownWidget,
            showTopFoodsWidget: showTopFoodsWidget,
            showSleepWidget: showSleepWidget,
            showFastingWidget: showFastingWidget,
            showDayPropertiesWidget: showDayPropertiesWidget,
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
            .fasting, .dayProperties, .chart, .favorites, .supplements,
            .weight, .mealBreakdown, .topFoods, .sleep, .daylog,
        ])
    }

    @Test("Explicit widgetOrder is respected verbatim")
    func explicitOrderIsRespected() {
        let order = ["sleep", "weight", "chart", "daylog"]
        let sections = DashboardSection.resolve(order: order, preferences: makePreferences())
        #expect(sections == [.sleep, .weight, .chart, .daylog])
    }

    @Test("summary and streaks never render, wherever they sit in the order")
    func summaryAndStreaksAreDropped() {
        let order = ["summary", "chart", "streaks", "daylog"]
        let sections = DashboardSection.resolve(order: order, preferences: makePreferences())
        #expect(sections == [.chart, .daylog])
    }

    @Test("Unknown keys are ignored instead of crashing")
    func unknownKeysAreIgnored() {
        let order = ["chart", "some-future-widget", "daylog"]
        let sections = DashboardSection.resolve(order: order, preferences: makePreferences())
        #expect(sections == [.chart, .daylog])
    }

    @Test("Sections hidden behind their toggle are excluded, preserving relative order")
    func disabledTogglesAreExcluded() {
        let preferences = makePreferences(showChartWidget: false, showWeightWidget: false)
        let order = ["fasting", "chart", "weight", "sleep", "daylog"]
        let sections = DashboardSection.resolve(order: order, preferences: preferences)
        #expect(sections == [.fasting, .sleep, .daylog])
    }

    @Test("daylog always renders even with every toggle off")
    func daylogAlwaysRenders() {
        let preferences = makePreferences(
            showFastingWidget: false,
            showDayPropertiesWidget: false,
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

    @Test("New fasting/day-properties toggles gate their sections")
    func newTogglesGateTheirSections() {
        let hidden = makePreferences(showFastingWidget: false, showDayPropertiesWidget: false)
        let order = ["fasting", "day-properties", "daylog"]
        #expect(DashboardSection.resolve(order: order, preferences: hidden) == [.daylog])

        let shown = makePreferences()
        #expect(DashboardSection.resolve(order: order, preferences: shown) == [.fasting, .dayProperties, .daylog])
    }

    @Test("isDashboardCard and hasVisibilityToggle are correct per case")
    func layoutRowFlags() {
        #expect(DashboardSection.summary.isDashboardCard == false)
        #expect(DashboardSection.streaks.isDashboardCard == false)
        #expect(DashboardSection.daylog.isDashboardCard == true)
        #expect(DashboardSection.daylog.hasVisibilityToggle == false)
        #expect(DashboardSection.chart.hasVisibilityToggle == true)
        #expect(DashboardSection.fasting.hasVisibilityToggle == true)
        #expect(DashboardSection.dayProperties.hasVisibilityToggle == true)
    }

    @Test("applyVisibility writes the matching PreferencesUpdate field")
    func applyVisibilityWritesMatchingField() {
        var update = PreferencesUpdate()
        DashboardSection.fasting.applyVisibility(false, to: &update)
        #expect(update.showFastingWidget == false)

        var dayPropertiesUpdate = PreferencesUpdate()
        DashboardSection.dayProperties.applyVisibility(true, to: &dayPropertiesUpdate)
        #expect(dayPropertiesUpdate.showDayPropertiesWidget == true)

        var noopUpdate = PreferencesUpdate()
        DashboardSection.daylog.applyVisibility(false, to: &noopUpdate)
        #expect(noopUpdate.showChartWidget == nil)
        #expect(noopUpdate.showFastingWidget == nil)
    }
}
