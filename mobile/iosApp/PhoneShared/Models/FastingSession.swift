import Foundation

/// A single fast — the one currently running (`endedAt == nil`) or a
/// completed one in the history. The canonical copy of the *running* session
/// lives in `FastingSessionStore` (App Group `UserDefaults`), never in
/// SwiftData: the app, the widget extension and the `EndFastIntent`
/// background process all need to read it, and the App Group defaults are
/// the established lightweight cross-process channel (see `WidgetSnapshot`).
struct FastingSession: Codable, Identifiable, Equatable {
    let id: UUID
    var startedAt: Date
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

    /// Wire shape for the server copy of a finished fast. The local UUID doubles
    /// as the server id, so a retried upload or an edit that lands before the
    /// first upload drained both hit the same row.
    var upsertBody: FastingSessionUpsert? {
        guard let endedAt else { return nil }
        return FastingSessionUpsert(
            id: id.uuidString.lowercased(),
            startedAt: DateFormatting.isoDateTimeString(from: startedAt),
            endedAt: DateFormatting.isoDateTimeString(from: endedAt),
            targetHours: targetHours
        )
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
        saveHistory([session] + loadHistory().filter { $0.id != session.id })
    }

    /// Replaces the record with the same id; re-sorts by start so an edited
    /// start keeps the list in order.
    static func updateInHistory(_ session: FastingSession) {
        saveHistory(loadHistory().filter { $0.id != session.id } + [session])
    }

    static func removeFromHistory(id: UUID) {
        saveHistory(loadHistory().filter { $0.id != id })
    }

    private static func saveHistory(_ history: [FastingSession]) {
        let sorted = Array(history.sorted { $0.startedAt > $1.startedAt }.prefix(historyLimit))
        guard let defaults, let data = try? JSONEncoder().encode(sorted) else { return }
        defaults.set(data, forKey: historyKey)
    }
}
