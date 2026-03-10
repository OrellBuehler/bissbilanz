import Foundation

struct Preferences: Codable {
    let showChartWidget: Bool
    let showFavoritesWidget: Bool
    let showSupplementsWidget: Bool
    let showWeightWidget: Bool
    let showMealBreakdownWidget: Bool
    let showTopFoodsWidget: Bool
    let widgetOrder: [String]
    let startPage: String
    let favoriteTapAction: String
    let favoriteMealAssignmentMode: String
    let visibleNutrients: [String]
    let locale: String?

    static let defaults = Preferences(
        showChartWidget: true,
        showFavoritesWidget: true,
        showSupplementsWidget: true,
        showWeightWidget: true,
        showMealBreakdownWidget: true,
        showTopFoodsWidget: true,
        widgetOrder: [],
        startPage: "dashboard",
        favoriteTapAction: "instant",
        favoriteMealAssignmentMode: "time_based",
        visibleNutrients: [],
        locale: nil
    )
}

struct PreferencesUpdate: Codable {
    var showChartWidget: Bool?
    var showFavoritesWidget: Bool?
    var showSupplementsWidget: Bool?
    var showWeightWidget: Bool?
    var showMealBreakdownWidget: Bool?
    var showTopFoodsWidget: Bool?
    var widgetOrder: [String]?
    var startPage: String?
    var favoriteTapAction: String?
    var favoriteMealAssignmentMode: String?
    var visibleNutrients: [String]?
    var locale: String?
}

struct PreferencesResponse: Codable {
    let preferences: Preferences
}

struct MealType: Codable, Identifiable {
    let id: String
    let userId: String
    let name: String
    let sortOrder: Int
    let createdAt: String?
}
