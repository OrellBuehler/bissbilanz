import Foundation

/// Reads and writes the synced `WatchState` in the watch's *own* App Group, so
/// the watch app and its complication share it on-device. App Groups never
/// cross devices, so this is fed exclusively by WatchConnectivity (see
/// `WatchConnectivityManager`) — never by the phone's `group.com.bissbilanz`.
///
/// Degrades gracefully when the suite is unavailable (e.g. an unsigned build
/// without the App Group entitlement): writes are dropped and reads fall back
/// to placeholder data — never a crash.
enum WatchStore {
    static let appGroupId = "group.com.bissbilanz.watch"
    static let stateKey = "watch_state_v1"

    static func load() -> WatchState? {
        guard let defaults = UserDefaults(suiteName: appGroupId),
              let data = defaults.data(forKey: stateKey)
        else { return nil }
        return try? JSONDecoder().decode(WatchState.self, from: data)
    }

    static func save(_ state: WatchState) {
        guard let defaults = UserDefaults(suiteName: appGroupId),
              let data = try? JSONEncoder().encode(state)
        else { return }
        defaults.set(data, forKey: stateKey)
    }
}
