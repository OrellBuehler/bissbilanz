import WidgetKit

struct SnapshotTimelineEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot
}

/// Single timeline provider shared by all Bissbilanz widgets. The app pushes
/// fresh snapshots (and reloads timelines) whenever data changes; the
/// 30-minute refresh plus an explicit midnight entry keep the widget correct
/// when the app hasn't run for a while.
struct SnapshotProvider: TimelineProvider {
    func placeholder(in _: Context) -> SnapshotTimelineEntry {
        SnapshotTimelineEntry(date: Date(), snapshot: .placeholder)
    }

    func getSnapshot(in _: Context, completion: @escaping (SnapshotTimelineEntry) -> Void) {
        completion(SnapshotTimelineEntry(date: Date(), snapshot: currentSnapshot(at: Date())))
    }

    func getTimeline(in _: Context, completion: @escaping (Timeline<SnapshotTimelineEntry>) -> Void) {
        let now = Date()
        var entries = [SnapshotTimelineEntry(date: now, snapshot: currentSnapshot(at: now))]
        // Roll the displayed day over at midnight even if no refresh runs.
        if let midnight = Calendar.current.nextDate(
            after: now,
            matching: DateComponents(hour: 0, minute: 0, second: 5),
            matchingPolicy: .nextTime
        ) {
            entries.append(SnapshotTimelineEntry(date: midnight, snapshot: currentSnapshot(at: midnight)))
        }
        completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(30 * 60))))
    }

    /// Live timeline data only — `.placeholder` is sample data and belongs in
    /// `placeholder(in:)`, never here (see `WidgetSnapshot.empty(on:)`).
    private func currentSnapshot(at date: Date) -> WidgetSnapshot {
        guard let stored = WidgetSnapshotStore.load() else { return .empty(on: date) }
        return stored.resetIfStale(on: date)
    }
}
