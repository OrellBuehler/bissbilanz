import Foundation

/// A screen the user can put in the tab bar, between the fixed Home and
/// Settings tabs. The raw values are shared with Android and the web
/// (`src/lib/config/navigation.ts`) — never rename one. The case order is the
/// order the tab editor lists them in.
enum NavigableTab: String, CaseIterable, Identifiable {
    case foods
    case favorites
    case recipes
    case recipeSuggestions = "recipe-suggestions"
    case insights
    case calendar
    case weight
    case sleep
    case fasting
    case supplements
    case aiTasks = "ai-tasks"

    var id: String {
        rawValue
    }

    /// Screens that only exist server-side, so not in Local mode.
    var requiresAccount: Bool {
        switch self {
        case .aiTasks:
            true
        case .foods, .favorites, .recipes, .recipeSuggestions, .insights, .calendar, .weight, .sleep, .fasting,
             .supplements:
            false
        }
    }

    func isAvailable(signedIn: Bool) -> Bool {
        signedIn || !requiresAccount
    }

    var label: String {
        switch self {
        case .foods: L10n.foods
        case .favorites: L10n.favorites
        case .recipes: L10n.recipes
        case .recipeSuggestions: L10n.recipeSuggestions
        case .insights: L10n.insights
        case .calendar: L10n.calendar
        case .weight: L10n.weight
        case .sleep: L10n.sleep
        case .fasting: L10n.fasting
        case .supplements: L10n.supplements
        case .aiTasks: L10n.aiTasks
        }
    }

    var icon: String {
        switch self {
        case .foods: "fork.knife"
        case .favorites: "star"
        case .recipes: "book"
        case .recipeSuggestions: "fork.knife.circle"
        case .insights: "chart.bar"
        case .calendar: "calendar"
        case .weight: "scalemass"
        case .sleep: "bed.double"
        case .fasting: "timer"
        case .supplements: "pills"
        case .aiTasks: "sparkles"
        }
    }
}

/// The tabs between Home and Settings, in the order the tab bar shows them.
/// Stored on this device only, as comma-separated raw ids under `storageKey`.
struct TabBarLayout: Equatable {
    static let storageKey = "selected_tabs"
    static let defaultRaw = "foods,favorites,insights"
    /// Which tab the app opens on: `homeId` or a `NavigableTab` raw id.
    static let landingStorageKey = "landing_tab"
    static let homeId = "home"
    static let settingsId = "settings"
    static let maxTabs = 3

    /// Unknown ids and repeats dropped, at most `maxTabs`, never empty.
    let tabs: [NavigableTab]

    init(raw: String) {
        let parsed = Self.parse(raw)
        tabs = parsed.isEmpty ? Self.parse(Self.defaultRaw) : parsed
    }

    init(tabs: [NavigableTab]) {
        self.init(raw: tabs.map(\.rawValue).joined(separator: ","))
    }

    var raw: String {
        tabs.map(\.rawValue).joined(separator: ",")
    }

    private static func parse(_ raw: String) -> [NavigableTab] {
        var parsed: [NavigableTab] = []
        for part in raw.split(separator: ",") {
            guard let tab = NavigableTab(rawValue: part.trimmingCharacters(in: .whitespaces)),
                  !parsed.contains(tab)
            else { continue }
            parsed.append(tab)
        }
        return Array(parsed.prefix(maxTabs))
    }

    /// What the tab bar shows. A tab that needs an account is left out while
    /// there is none, but stays stored, so it comes back on sign-in. When
    /// nothing is left the defaults stand in, so the bar is never just Home
    /// and Settings.
    func visibleTabs(signedIn: Bool) -> [NavigableTab] {
        let visible = tabs.filter { $0.isAvailable(signedIn: signedIn) }
        guard visible.isEmpty else { return visible }
        return TabBarLayout(raw: Self.defaultRaw).tabs.filter { $0.isAvailable(signedIn: signedIn) }
    }

    func canAdd(_ tab: NavigableTab, signedIn: Bool) -> Bool {
        let visible = visibleTabs(signedIn: signedIn)
        return tab.isAvailable(signedIn: signedIn) && !visible.contains(tab) && visible.count < Self.maxTabs
    }

    func canRemove(_ tab: NavigableTab, signedIn: Bool) -> Bool {
        let visible = visibleTabs(signedIn: signedIn)
        return visible.contains(tab) && visible.count > 1
    }

    func adding(_ tab: NavigableTab, signedIn: Bool) -> TabBarLayout {
        guard canAdd(tab, signedIn: signedIn) else { return self }
        return replacingVisible(visibleTabs(signedIn: signedIn) + [tab], signedIn: signedIn)
    }

    func removing(_ tab: NavigableTab, signedIn: Bool) -> TabBarLayout {
        guard canRemove(tab, signedIn: signedIn) else { return self }
        return replacingVisible(visibleTabs(signedIn: signedIn).filter { $0 != tab }, signedIn: signedIn)
    }

    /// `List.onMove` semantics: `destination` is an index into the visible
    /// tabs before the move.
    func moving(fromOffsets source: IndexSet, toOffset destination: Int, signedIn: Bool) -> TabBarLayout {
        let visible = visibleTabs(signedIn: signedIn)
        let offsets = source.filter { $0 >= 0 && $0 < visible.count }
        guard !offsets.isEmpty else { return self }
        let moved = offsets.map { visible[$0] }
        var remaining = visible.enumerated().filter { !offsets.contains($0.offset) }.map { $0.element }
        let target = destination - offsets.filter { $0 < destination }.count
        remaining.insert(contentsOf: moved, at: min(max(target, 0), remaining.count))
        return replacingVisible(remaining, signedIn: signedIn)
    }

    /// The edited visible tabs, with any tab hidden for want of an account
    /// put back where it was while the bar has room for it.
    private func replacingVisible(_ visible: [NavigableTab], signedIn: Bool) -> TabBarLayout {
        var result = visible
        for (index, tab) in tabs.enumerated() where !tab.isAvailable(signedIn: signedIn) {
            guard result.count < Self.maxTabs else { break }
            result.insert(tab, at: min(index, result.count))
        }
        return TabBarLayout(tabs: result)
    }

    /// The stored landing tab while the bar shows it, Home otherwise.
    func landingTab(_ stored: String, signedIn: Bool) -> String {
        visibleTabs(signedIn: signedIn).contains { $0.rawValue == stored } ? stored : Self.homeId
    }

    /// The tab the app opens on, read straight from `defaults` for code
    /// outside the views.
    static func storedLandingTab(defaults: UserDefaults, signedIn: Bool) -> String {
        let layout = TabBarLayout(raw: defaults.string(forKey: storageKey) ?? defaultRaw)
        return layout.landingTab(defaults.string(forKey: landingStorageKey) ?? homeId, signedIn: signedIn)
    }

    /// Removing the landing tab sends the app back to opening on Home, so
    /// adding that tab again later does not quietly make it the landing tab.
    static func landing(_ landing: String, afterRemoving tab: NavigableTab) -> String {
        landing == tab.rawValue ? homeId : landing
    }

    /// The tab to show: the one the user picked while it still exists,
    /// otherwise the landing tab.
    func selection(current: String?, landing: String, signedIn: Bool) -> String {
        if let current, isShown(current, signedIn: signedIn) {
            return current
        }
        return landingTab(landing, signedIn: signedIn)
    }

    private func isShown(_ id: String, signedIn: Bool) -> Bool {
        if id == Self.homeId || id == Self.settingsId {
            return true
        }
        return visibleTabs(signedIn: signedIn).contains { $0.rawValue == id }
    }
}
