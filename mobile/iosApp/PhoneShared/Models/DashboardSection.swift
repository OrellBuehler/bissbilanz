import Foundation

/// Keys `preferences.widgetOrder` may contain — one-to-one with the server's
/// `widgetOrder` enum (see src/lib/server/validation/responses/preferences.ts).
/// `summary` (the dashboard's macro-rings header, always pinned above the
/// per-section loop regardless of its position), `streaks` (no dashboard
/// card exists — streaks only appear on the Insights screen) and
/// `dayProperties` (the former single water/activity/notes slot, now split
/// into `water`, `activity` and `notes`; the server keeps the key so older
/// builds still find their slot) are position placeholders: they round-trip
/// through `widgetOrder` but never render, on the dashboard or as a
/// `DashboardLayoutView` row.
enum DashboardSection: String, CaseIterable {
    case fasting
    case water
    case activity
    case notes
    case dayProperties = "day-properties"
    case chart
    case streaks
    case favorites
    case recipeSuggestions = "recipe-suggestions"
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
        fasting.rawValue, water.rawValue, activity.rawValue, notes.rawValue, dayProperties.rawValue,
        chart.rawValue, favorites.rawValue, recipeSuggestions.rawValue, supplements.rawValue,
        weight.rawValue, mealBreakdown.rawValue, topFoods.rawValue, sleep.rawValue, summary.rawValue,
        daylog.rawValue,
    ]

    /// `order` (falling back to `defaultOrder` when empty) with any of
    /// `water`/`activity`/`notes` it lacks — a cached or local-mode order that
    /// predates the split — inserted where the `dayProperties` placeholder
    /// sits, else right after `fasting`, else at the front. Nothing already in
    /// `order` is dropped or moved, so the result is safe to save back.
    static func normalizedOrder(_ order: [String]) -> [String] {
        let keys = order.isEmpty ? defaultOrder : order
        let missing = [water.rawValue, activity.rawValue, notes.rawValue].filter { !keys.contains($0) }
        guard !missing.isEmpty else { return keys }
        var result = keys
        let index: Int
        if let placeholder = result.firstIndex(of: dayProperties.rawValue) {
            index = placeholder
        } else if let fastingIndex = result.firstIndex(of: fasting.rawValue) {
            index = fastingIndex + 1
        } else {
            index = 0
        }
        result.insert(contentsOf: missing, at: index)
        return result
    }

    /// Whether this key has a dashboard card / layout-editor row at all.
    var isDashboardCard: Bool {
        self != .summary && self != .streaks && self != .dayProperties
    }

    /// `daylog` is always on — reorderable in the layout editor, but with no
    /// toggle to hide it.
    var hasVisibilityToggle: Bool {
        isDashboardCard && self != .daylog
    }

    /// Whether `preferences` currently has this section's widget switched on.
    /// Sections without a toggle (`daylog`, and the non-rendering
    /// `streaks`/`summary`/`dayProperties` placeholders) are always considered
    /// enabled.
    func isEnabled(in preferences: Preferences) -> Bool {
        switch self {
        case .fasting: preferences.showFastingWidget
        case .water: preferences.showWaterWidget
        case .activity: preferences.showActivityWidget
        case .notes: preferences.showNotesWidget
        case .chart: preferences.showChartWidget
        case .favorites: preferences.showFavoritesWidget
        case .recipeSuggestions: preferences.showRecipeSuggestionsWidget
        case .supplements: preferences.showSupplementsWidget
        case .weight: preferences.showWeightWidget
        case .mealBreakdown: preferences.showMealBreakdownWidget
        case .topFoods: preferences.showTopFoodsWidget
        case .sleep: preferences.showSleepWidget
        case .streaks, .summary, .dayProperties, .daylog: true
        }
    }

    /// Writes `value` into the matching `PreferencesUpdate` field. A no-op
    /// for sections without a visibility toggle.
    func applyVisibility(_ value: Bool, to update: inout PreferencesUpdate) {
        switch self {
        case .fasting: update.showFastingWidget = value
        case .water: update.showWaterWidget = value
        case .activity: update.showActivityWidget = value
        case .notes: update.showNotesWidget = value
        case .chart: update.showChartWidget = value
        case .favorites: update.showFavoritesWidget = value
        case .recipeSuggestions: update.showRecipeSuggestionsWidget = value
        case .supplements: update.showSupplementsWidget = value
        case .weight: update.showWeightWidget = value
        case .mealBreakdown: update.showMealBreakdownWidget = value
        case .topFoods: update.showTopFoodsWidget = value
        case .sleep: update.showSleepWidget = value
        case .streaks, .summary, .dayProperties, .daylog: break
        }
    }

    /// Builds the dashboard's rendered section list: `order` (falling back to
    /// `defaultOrder` when empty, and gaining any `water`/`activity`/`notes` it
    /// lacks via `normalizedOrder`), filtered to the sections the dashboard can
    /// draw and that `preferences` currently has enabled. Unknown keys — a
    /// future server addition this build doesn't recognize yet — are dropped
    /// rather than failing.
    static func resolve(order: [String], preferences: Preferences) -> [DashboardSection] {
        return normalizedOrder(order).compactMap { DashboardSection(rawValue: $0) }
            .filter { $0.isDashboardCard && $0.isEnabled(in: preferences) }
    }
}
