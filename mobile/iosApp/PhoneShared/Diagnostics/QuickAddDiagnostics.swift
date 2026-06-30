import Foundation

/// Lightweight failure log for `QuickAddFoodIntent`, written from the widget
/// extension process and drained by the main app into `ErrorReporter` (Sentry)
/// on next foreground. The extension can't link Sentry itself without working
/// against the issue's own "~30MB ceiling, keep `perform()` lean" guidance
/// (crash handler, view-hierarchy capture, MetricKit all add real overhead),
/// so failures are relayed via this small App Group `UserDefaults` queue instead.
enum QuickAddDiagnostics {
    private static let key = "quick_add_diagnostics_v1"
    private static let maxEntries = 20

    struct Entry: Codable {
        let timestamp: Date
        let phase: String
        let message: String
    }

    static func record(phase: String, error: Error) {
        guard let defaults = UserDefaults(suiteName: WidgetSnapshotStore.appGroupId) else { return }
        var entries = load(defaults)
        entries.append(Entry(timestamp: Date(), phase: phase, message: String(describing: error)))
        if entries.count > maxEntries {
            entries.removeFirst(entries.count - maxEntries)
        }
        if let data = try? JSONEncoder().encode(entries) {
            defaults.set(data, forKey: key)
        }
    }

    /// App-only in practice (nothing in the widget extension calls this):
    /// returns and clears the queued entries.
    static func drain() -> [Entry] {
        guard let defaults = UserDefaults(suiteName: WidgetSnapshotStore.appGroupId) else { return [] }
        let entries = load(defaults)
        defaults.removeObject(forKey: key)
        return entries
    }

    private static func load(_ defaults: UserDefaults) -> [Entry] {
        guard let data = defaults.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([Entry].self, from: data)) ?? []
    }
}
