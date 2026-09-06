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
    /// `"male"`, `"female"` or nil ("not set") — the server's own spelling.
    /// Feeds the nutrient-gap analytics' reference intakes. Optional and `var`
    /// with a default so a response (or cached row) that omits it still
    /// decodes, and existing memberwise call sites keep compiling.
    var biologicalSex: String? = nil
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
        biologicalSex: nil,
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
    /// Double optional like `EntryUpdate.notes`: the server only writes the
    /// column when the key is present, so "not set" has to travel as an
    /// explicit null. `nil` omits it, `.some(nil)` clears it.
    var biologicalSex: String??
    var locale: String?
    var timeZone: String?
    var favoriteMealTimeframes: [FavoriteMealTimeframe]?
}

/// Declared in an extension so the memberwise initializer survives.
extension PreferencesUpdate {
    private enum CodingKeys: String, CodingKey {
        case showChartWidget, showFavoritesWidget, showSupplementsWidget, showWeightWidget
        case showMealBreakdownWidget, showTopFoodsWidget, showSleepWidget
        case widgetOrder, startPage, favoriteTapAction, favoriteMealAssignmentMode
        case visibleNutrients, biologicalSex, locale, timeZone, favoriteMealTimeframes
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        showChartWidget = try container.decodeIfPresent(Bool.self, forKey: .showChartWidget)
        showFavoritesWidget = try container.decodeIfPresent(Bool.self, forKey: .showFavoritesWidget)
        showSupplementsWidget = try container.decodeIfPresent(Bool.self, forKey: .showSupplementsWidget)
        showWeightWidget = try container.decodeIfPresent(Bool.self, forKey: .showWeightWidget)
        showMealBreakdownWidget = try container.decodeIfPresent(Bool.self, forKey: .showMealBreakdownWidget)
        showTopFoodsWidget = try container.decodeIfPresent(Bool.self, forKey: .showTopFoodsWidget)
        showSleepWidget = try container.decodeIfPresent(Bool.self, forKey: .showSleepWidget)
        widgetOrder = try container.decodeIfPresent([String].self, forKey: .widgetOrder)
        startPage = try container.decodeIfPresent(String.self, forKey: .startPage)
        favoriteTapAction = try container.decodeIfPresent(String.self, forKey: .favoriteTapAction)
        favoriteMealAssignmentMode = try container.decodeIfPresent(String.self, forKey: .favoriteMealAssignmentMode)
        visibleNutrients = try container.decodeIfPresent([String].self, forKey: .visibleNutrients)
        biologicalSex = try container.decodeNullable(String.self, forKey: .biologicalSex)
        locale = try container.decodeIfPresent(String.self, forKey: .locale)
        timeZone = try container.decodeIfPresent(String.self, forKey: .timeZone)
        favoriteMealTimeframes = try container.decodeIfPresent(
            [FavoriteMealTimeframe].self,
            forKey: .favoriteMealTimeframes
        )
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(showChartWidget, forKey: .showChartWidget)
        try container.encodeIfPresent(showFavoritesWidget, forKey: .showFavoritesWidget)
        try container.encodeIfPresent(showSupplementsWidget, forKey: .showSupplementsWidget)
        try container.encodeIfPresent(showWeightWidget, forKey: .showWeightWidget)
        try container.encodeIfPresent(showMealBreakdownWidget, forKey: .showMealBreakdownWidget)
        try container.encodeIfPresent(showTopFoodsWidget, forKey: .showTopFoodsWidget)
        try container.encodeIfPresent(showSleepWidget, forKey: .showSleepWidget)
        try container.encodeIfPresent(widgetOrder, forKey: .widgetOrder)
        try container.encodeIfPresent(startPage, forKey: .startPage)
        try container.encodeIfPresent(favoriteTapAction, forKey: .favoriteTapAction)
        try container.encodeIfPresent(favoriteMealAssignmentMode, forKey: .favoriteMealAssignmentMode)
        try container.encodeIfPresent(visibleNutrients, forKey: .visibleNutrients)
        try container.encodeNullable(biologicalSex, forKey: .biologicalSex)
        try container.encodeIfPresent(locale, forKey: .locale)
        try container.encodeIfPresent(timeZone, forKey: .timeZone)
        try container.encodeIfPresent(favoriteMealTimeframes, forKey: .favoriteMealTimeframes)
    }
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
