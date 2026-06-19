import WidgetKit

struct WatchComplicationEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot
}

/// Timeline provider for the watch complications. Renders from the watch's own
/// App Group store (fed by `WatchConnectivityManager`); the manager reloads
/// timelines on every sync, and the 30-minute refresh plus a midnight entry
/// keep the ring correct when no sync has arrived for a while.
struct WatchComplicationProvider: TimelineProvider {
    func placeholder(in _: Context) -> WatchComplicationEntry {
        WatchComplicationEntry(date: Date(), snapshot: .placeholder)
    }

    func getSnapshot(in _: Context, completion: @escaping (WatchComplicationEntry) -> Void) {
        completion(entry(at: Date()))
    }

    func getTimeline(in _: Context, completion: @escaping (Timeline<WatchComplicationEntry>) -> Void) {
        let now = Date()
        var entries = [entry(at: now)]
        if let midnight = Calendar.current.nextDate(
            after: now,
            matching: DateComponents(hour: 0, minute: 0, second: 5),
            matchingPolicy: .nextTime
        ) {
            entries.append(entry(at: midnight))
        }
        completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(30 * 60))))
    }

    private func entry(at date: Date) -> WatchComplicationEntry {
        let snapshot = (WatchStore.load()?.snapshot ?? .placeholder).resetIfStale(on: date)
        return WatchComplicationEntry(date: date, snapshot: snapshot)
    }
}
