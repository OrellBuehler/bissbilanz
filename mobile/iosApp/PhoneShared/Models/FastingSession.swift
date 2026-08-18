import Foundation

/// A single fast — the one currently running (`endedAt == nil`) or a
/// completed one in the history. The canonical copy of the *running* session
/// lives in `FastingSessionStore` (App Group `UserDefaults`), never in
/// SwiftData: the app, the widget extension and the `EndFastIntent`
/// background process all need to read it, and the App Group defaults are
/// the established lightweight cross-process channel (see `WidgetSnapshot`).
struct FastingSession: Codable, Identifiable {
    let id: UUID
    let startedAt: Date
    var targetHours: Int
    var endedAt: Date?

    init(id: UUID = UUID(), startedAt: Date, targetHours: Int, endedAt: Date? = nil) {
        self.id = id
        self.startedAt = startedAt
        self.targetHours = targetHours
        self.endedAt = endedAt
    }

    var targetEndDate: Date {
        startedAt.addingTimeInterval(TimeInterval(targetHours) * 3600)
    }

    var duration: TimeInterval? {
        endedAt.map { $0.timeIntervalSince(startedAt) }
    }

    var reachedTarget: Bool {
        (duration ?? 0) >= TimeInterval(targetHours) * 3600
    }

    /// Range driving the date-relative elapsed timers (`Text(timerInterval:)`).
    /// The upper bound is a far-out cap, not the target — an elapsed timer
    /// must keep counting past the target, it only stops at the range's end.
    var elapsedRange: ClosedRange<Date> {
        startedAt ... startedAt.addingTimeInterval(7 * 24 * 3600)
    }

    /// Range driving the date-relative progress views and the remaining
    /// countdown. Guarded so it stays a valid range even for a malformed
    /// zero-hour session.
    var progressRange: ClosedRange<Date> {
        startedAt ... max(targetEndDate, startedAt.addingTimeInterval(60))
    }
}

/// Reads and writes the running fast and the finished-fast history in the
/// shared App Group `UserDefaults`, mirroring `WidgetSnapshotStore`. Both
/// sides degrade gracefully when the suite is unavailable — callers just see
/// "no session".
enum FastingSessionStore {
    static let currentKey = "fasting_session_v1"
    static let historyKey = "fasting_history_v1"
    static let historyLimit = 60

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: WidgetSnapshotStore.appGroupId)
    }

    static func loadCurrent() -> FastingSession? {
        guard let data = defaults?.data(forKey: currentKey) else { return nil }
        return try? JSONDecoder().decode(FastingSession.self, from: data)
    }

    static func saveCurrent(_ session: FastingSession) {
        guard let defaults, let data = try? JSONEncoder().encode(session) else { return }
        defaults.set(data, forKey: currentKey)
    }

    static func clearCurrent() {
        defaults?.removeObject(forKey: currentKey)
    }

    /// Finished fasts, most recent first.
    static func loadHistory() -> [FastingSession] {
        guard let data = defaults?.data(forKey: historyKey) else { return [] }
        return (try? JSONDecoder().decode([FastingSession].self, from: data)) ?? []
    }

    static func appendToHistory(_ session: FastingSession) {
        let history = Array(([session] + loadHistory()).prefix(historyLimit))
        guard let defaults, let data = try? JSONEncoder().encode(history) else { return }
        defaults.set(data, forKey: historyKey)
    }

    static func removeFromHistory(id: UUID) {
        let history = loadHistory().filter { $0.id != id }
        guard let defaults, let data = try? JSONEncoder().encode(history) else { return }
        defaults.set(data, forKey: historyKey)
    }
}
