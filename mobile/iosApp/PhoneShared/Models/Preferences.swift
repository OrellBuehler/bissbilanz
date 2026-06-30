import Foundation

/// The widget booleans, names and types mirror the server's preferences response
/// schema (src/lib/server/validation/responses/preferences.ts) field-for-field.
/// `summary`, `daylog` and `streaks` are NOT toggles — they are `widgetOrder`
/// section keys server-side, so there are no `showSummary/DayLog/StreakWidget`
/// columns. Keep this in sync with the server contract: a field iOS marks
/// required but the server omits makes the whole response fail to decode.
struct Preferences: Codable {
    let showChartWidget: Bool
    let showFavoritesWidget: Bool
    let showSupplementsWidget: Bool
    let showWeightWidget: Bool
    let showMealBreakdownWidget: Bool
    let showTopFoodsWidget: Bool
    let showSleepWidget: Bool
    let widgetOrder: [String]
    let startPage: String
    let favoriteTapAction: String
    let favoriteMealAssignmentMode: String
    let visibleNutrients: [String]
    let locale: String?
    let timeZone: String?

    static let defaults = Preferences(
        showChartWidget: true,
        showFavoritesWidget: true,
        showSupplementsWidget: true,
        showWeightWidget: true,
        showMealBreakdownWidget: true,
        showTopFoodsWidget: true,
        showSleepWidget: true,
        widgetOrder: [],
        startPage: "dashboard",
        favoriteTapAction: "instant",
        favoriteMealAssignmentMode: "time_based",
        visibleNutrients: [],
        locale: nil,
        timeZone: "UTC"
    )
}

/// The server wraps the preferences body as `{ preferences: {...} }` on both GET
/// and PATCH; decode this envelope, not a bare `Preferences`.
struct PreferencesResponse: Codable {
    let preferences: Preferences
}

struct PreferencesUpdate: Codable {
    var showChartWidget: Bool?
    var showFavoritesWidget: Bool?
    var showSupplementsWidget: Bool?
    var showWeightWidget: Bool?
    var showMealBreakdownWidget: Bool?
    var showTopFoodsWidget: Bool?
    var showSleepWidget: Bool?
    var widgetOrder: [String]?
    var startPage: String?
    var favoriteTapAction: String?
    var favoriteMealAssignmentMode: String?
    var visibleNutrients: [String]?
    var locale: String?
    var timeZone: String?
    var favoriteMealTimeframes: [FavoriteMealTimeframe]?
}

struct FavoriteMealTimeframe: Codable {
    let mealType: String
    let startTime: String
    let endTime: String
}

struct MealType: Codable, Identifiable {
    let id: String
    let userId: String
    let name: String
    let sortOrder: Int
    let createdAt: String?
}
