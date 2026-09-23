import Foundation

/// The widget booleans, names and types mirror the server's preferences response
/// schema (src/lib/server/validation/responses/preferences.ts) field-for-field.
/// `summary`, `daylog` and `streaks` are NOT toggles — they are `widgetOrder`
/// section keys server-side, so there are no `showSummary/DayLog/StreakWidget`
/// columns. Keep this in sync with the server contract: a field iOS marks
/// required but the server omits makes the whole response fail to decode.
struct Preferences: Codable, Equatable {
    let showChartWidget: Bool
    let showFavoritesWidget: Bool
    let showSupplementsWidget: Bool
    let showWeightWidget: Bool
    let showMealBreakdownWidget: Bool
    let showTopFoodsWidget: Bool
    let showSleepWidget: Bool
    /// `var` with a default like `biologicalSex`/`waterGoalMl` below: a cached
    /// row written by a version of the app that predates these two widgets
    /// lacks the keys entirely, and the custom decode in the extension below
    /// falls back to `true` rather than failing the whole object.
    var showFastingWidget: Bool = true
    var showDayPropertiesWidget: Bool = true
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
    /// Daily water goal in ml (server default 2000, min 250, max 10000). Like
    /// `biologicalSex`, optional and `var` with a default so a cached row from
    /// before this field existed still decodes instead of failing the whole
    /// object, and existing memberwise call sites keep compiling. Callers read
    /// `waterGoalMl ?? 2000`.
    var waterGoalMl: Int? = nil
    /// Whether a day's calorie/macro goals are raised by its Apple Health/Health
    /// Connect activity calories (see `adjustGoalsForActivity`). `var` with a
    /// default like `showFastingWidget` above so a cached row or server
    /// response from before this field existed still decodes as "off".
    var activityGoalAdjustment: Bool = false
    /// Percent (0-100) of a day's activity calories credited back to the
    /// goal when `activityGoalAdjustment` is on. `var` with a default like
    /// `activityGoalAdjustment` above.
    var activityCreditPercent: Int = 100

    static let defaults = Preferences(
        showChartWidget: true,
        showFavoritesWidget: true,
        showSupplementsWidget: true,
        showWeightWidget: true,
        showMealBreakdownWidget: true,
        showTopFoodsWidget: true,
        showSleepWidget: true,
        showFastingWidget: true,
        showDayPropertiesWidget: true,
        widgetOrder: [],
        startPage: "dashboard",
        favoriteTapAction: "instant",
        favoriteMealAssignmentMode: "time_based",
        visibleNutrients: [],
        biologicalSex: nil,
        locale: nil,
        timeZone: "UTC",
        waterGoalMl: nil,
        activityGoalAdjustment: false,
        activityCreditPercent: 100
    )
}

/// Declared in an extension so the memberwise initializer survives (see
/// `PreferencesUpdate` below for the same trick). Needed only so
/// `showFastingWidget`/`showDayPropertiesWidget` can default to `true` when a
/// cached row or server response omits them — every other field keeps the
/// exact required/optional shape the compiler would have synthesized anyway.
extension Preferences {
    private enum CodingKeys: String, CodingKey {
        case showChartWidget, showFavoritesWidget, showSupplementsWidget, showWeightWidget
        case showMealBreakdownWidget, showTopFoodsWidget, showSleepWidget
        case showFastingWidget, showDayPropertiesWidget
        case widgetOrder, startPage, favoriteTapAction, favoriteMealAssignmentMode
        case visibleNutrients, biologicalSex, locale, timeZone, waterGoalMl
        case activityGoalAdjustment, activityCreditPercent
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        showChartWidget = try container.decode(Bool.self, forKey: .showChartWidget)
        showFavoritesWidget = try container.decode(Bool.self, forKey: .showFavoritesWidget)
        showSupplementsWidget = try container.decode(Bool.self, forKey: .showSupplementsWidget)
        showWeightWidget = try container.decode(Bool.self, forKey: .showWeightWidget)
        showMealBreakdownWidget = try container.decode(Bool.self, forKey: .showMealBreakdownWidget)
        showTopFoodsWidget = try container.decode(Bool.self, forKey: .showTopFoodsWidget)
        showSleepWidget = try container.decode(Bool.self, forKey: .showSleepWidget)
        showFastingWidget = try container.decodeIfPresent(Bool.self, forKey: .showFastingWidget) ?? true
        showDayPropertiesWidget = try container.decodeIfPresent(Bool.self, forKey: .showDayPropertiesWidget) ?? true
        widgetOrder = try container.decode([String].self, forKey: .widgetOrder)
        startPage = try container.decode(String.self, forKey: .startPage)
        favoriteTapAction = try container.decode(String.self, forKey: .favoriteTapAction)
        favoriteMealAssignmentMode = try container.decode(String.self, forKey: .favoriteMealAssignmentMode)
        visibleNutrients = try container.decode([String].self, forKey: .visibleNutrients)
        biologicalSex = try container.decodeIfPresent(String.self, forKey: .biologicalSex)
        locale = try container.decodeIfPresent(String.self, forKey: .locale)
        timeZone = try container.decodeIfPresent(String.self, forKey: .timeZone)
        waterGoalMl = try container.decodeIfPresent(Int.self, forKey: .waterGoalMl)
        activityGoalAdjustment = try container.decodeIfPresent(Bool.self, forKey: .activityGoalAdjustment) ?? false
        activityCreditPercent = try container.decodeIfPresent(Int.self, forKey: .activityCreditPercent) ?? 100
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(showChartWidget, forKey: .showChartWidget)
        try container.encode(showFavoritesWidget, forKey: .showFavoritesWidget)
        try container.encode(showSupplementsWidget, forKey: .showSupplementsWidget)
        try container.encode(showWeightWidget, forKey: .showWeightWidget)
        try container.encode(showMealBreakdownWidget, forKey: .showMealBreakdownWidget)
        try container.encode(showTopFoodsWidget, forKey: .showTopFoodsWidget)
        try container.encode(showSleepWidget, forKey: .showSleepWidget)
        try container.encode(showFastingWidget, forKey: .showFastingWidget)
        try container.encode(showDayPropertiesWidget, forKey: .showDayPropertiesWidget)
        try container.encode(widgetOrder, forKey: .widgetOrder)
        try container.encode(startPage, forKey: .startPage)
        try container.encode(favoriteTapAction, forKey: .favoriteTapAction)
        try container.encode(favoriteMealAssignmentMode, forKey: .favoriteMealAssignmentMode)
        try container.encode(visibleNutrients, forKey: .visibleNutrients)
        try container.encodeIfPresent(biologicalSex, forKey: .biologicalSex)
        try container.encodeIfPresent(locale, forKey: .locale)
        try container.encodeIfPresent(timeZone, forKey: .timeZone)
        try container.encodeIfPresent(waterGoalMl, forKey: .waterGoalMl)
        try container.encode(activityGoalAdjustment, forKey: .activityGoalAdjustment)
        try container.encode(activityCreditPercent, forKey: .activityCreditPercent)
    }
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
    var showFastingWidget: Bool?
    var showDayPropertiesWidget: Bool?
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
    var waterGoalMl: Int?
    var activityGoalAdjustment: Bool?
    var activityCreditPercent: Int?
}

/// Declared in an extension so the memberwise initializer survives.
extension PreferencesUpdate {
    private enum CodingKeys: String, CodingKey {
        case showChartWidget, showFavoritesWidget, showSupplementsWidget, showWeightWidget
        case showMealBreakdownWidget, showTopFoodsWidget, showSleepWidget
        case showFastingWidget, showDayPropertiesWidget
        case widgetOrder, startPage, favoriteTapAction, favoriteMealAssignmentMode
        case visibleNutrients, biologicalSex, locale, timeZone, favoriteMealTimeframes, waterGoalMl
        case activityGoalAdjustment, activityCreditPercent
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
        showFastingWidget = try container.decodeIfPresent(Bool.self, forKey: .showFastingWidget)
        showDayPropertiesWidget = try container.decodeIfPresent(Bool.self, forKey: .showDayPropertiesWidget)
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
        waterGoalMl = try container.decodeIfPresent(Int.self, forKey: .waterGoalMl)
        activityGoalAdjustment = try container.decodeIfPresent(Bool.self, forKey: .activityGoalAdjustment)
        activityCreditPercent = try container.decodeIfPresent(Int.self, forKey: .activityCreditPercent)
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
        try container.encodeIfPresent(showFastingWidget, forKey: .showFastingWidget)
        try container.encodeIfPresent(showDayPropertiesWidget, forKey: .showDayPropertiesWidget)
        try container.encodeIfPresent(widgetOrder, forKey: .widgetOrder)
        try container.encodeIfPresent(startPage, forKey: .startPage)
        try container.encodeIfPresent(favoriteTapAction, forKey: .favoriteTapAction)
        try container.encodeIfPresent(favoriteMealAssignmentMode, forKey: .favoriteMealAssignmentMode)
        try container.encodeIfPresent(visibleNutrients, forKey: .visibleNutrients)
        try container.encodeNullable(biologicalSex, forKey: .biologicalSex)
        try container.encodeIfPresent(locale, forKey: .locale)
        try container.encodeIfPresent(timeZone, forKey: .timeZone)
        try container.encodeIfPresent(favoriteMealTimeframes, forKey: .favoriteMealTimeframes)
        try container.encodeIfPresent(waterGoalMl, forKey: .waterGoalMl)
        try container.encodeIfPresent(activityGoalAdjustment, forKey: .activityGoalAdjustment)
        try container.encodeIfPresent(activityCreditPercent, forKey: .activityCreditPercent)
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
