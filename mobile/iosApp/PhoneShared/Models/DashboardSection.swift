import Foundation

/// Keys `preferences.widgetOrder` may contain — one-to-one with the server's
/// `widgetOrder` enum (see src/lib/server/validation/responses/preferences.ts).
/// `summary` (the dashboard's macro-rings header, always pinned above the
/// per-section loop regardless of its position) and `streaks` (no dashboard
/// card exists — streaks only appear on the Insights screen) are position
/// placeholders: they round-trip through `widgetOrder` but never render, on
/// the dashboard or as a `DashboardLayoutView` row.
enum DashboardSection: String, CaseIterable {
    case fasting
    case dayProperties = "day-properties"
    case chart
    case streaks
    case favorites
    case supplements
    case weight
    case mealBreakdown = "meal-breakdown"
    case topFoods = "top-foods"
    case sleep
    case summary
    case daylog

    /// The server's own default order (see preferences.ts), used whenever
    /// `widgetOrder` is empty — a brand-new account, or a client that
    /// predates `widgetOrder` entirely.
    static let defaultOrder: [String] = [
        fasting.rawValue, dayProperties.rawValue, chart.rawValue, favorites.rawValue,
        supplements.rawValue, weight.rawValue, mealBreakdown.rawValue, topFoods.rawValue,
        sleep.rawValue, summary.rawValue, daylog.rawValue,
    ]

    /// Whether this key has a dashboard card / layout-editor row at all.
    var isDashboardCard: Bool {
        self != .summary && self != .streaks
    }

    /// `daylog` is always on — reorderable in the layout editor, but with no
    /// toggle to hide it.
    var hasVisibilityToggle: Bool {
        isDashboardCard && self != .daylog
    }

    /// Whether `preferences` currently has this section's widget switched on.
    /// Sections without a toggle (`daylog`, and the non-rendering
    /// `streaks`/`summary` placeholders) are always considered enabled.
    func isEnabled(in preferences: Preferences) -> Bool {
        switch self {
        case .fasting: preferences.showFastingWidget
        case .dayProperties: preferences.showDayPropertiesWidget
        case .chart: preferences.showChartWidget
        case .favorites: preferences.showFavoritesWidget
        case .supplements: preferences.showSupplementsWidget
        case .weight: preferences.showWeightWidget
        case .mealBreakdown: preferences.showMealBreakdownWidget
        case .topFoods: preferences.showTopFoodsWidget
        case .sleep: preferences.showSleepWidget
        case .streaks, .summary, .daylog: true
        }
    }

    /// Writes `value` into the matching `PreferencesUpdate` field. A no-op
    /// for sections without a visibility toggle.
    func applyVisibility(_ value: Bool, to update: inout PreferencesUpdate) {
        switch self {
        case .fasting: update.showFastingWidget = value
        case .dayProperties: update.showDayPropertiesWidget = value
        case .chart: update.showChartWidget = value
        case .favorites: update.showFavoritesWidget = value
        case .supplements: update.showSupplementsWidget = value
        case .weight: update.showWeightWidget = value
        case .mealBreakdown: update.showMealBreakdownWidget = value
        case .topFoods: update.showTopFoodsWidget = value
        case .sleep: update.showSleepWidget = value
        case .streaks, .summary, .daylog: break
        }
    }

    /// Builds the dashboard's rendered section list: `order` (falling back to
    /// `defaultOrder` when empty), filtered to the sections the dashboard can
    /// draw and that `preferences` currently has enabled. Unknown keys — a
    /// future server addition this build doesn't recognize yet — are dropped
    /// rather than failing.
    static func resolve(order: [String], preferences: Preferences) -> [DashboardSection] {
        let keys = order.isEmpty ? defaultOrder : order
        return keys.compactMap { DashboardSection(rawValue: $0) }
            .filter { $0.isDashboardCard && $0.isEnabled(in: preferences) }
    }
}
