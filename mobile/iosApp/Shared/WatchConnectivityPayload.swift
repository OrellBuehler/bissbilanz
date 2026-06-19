import Foundation

// Wire types exchanged between the iPhone and the Apple Watch over
// `WCSession`. Kept Foundation-only (no `WatchConnectivity` import) so the
// file compiles into every target that shares `Shared/` — including the
// widget extensions, which never link WatchConnectivity. The session glue
// that actually imports `WatchConnectivity` lives in the app and watch
// targets.
//
// **App Groups do not cross devices**, so the watch can't read the phone's
// `WidgetSnapshot`. Everything the watch shows travels through here instead;
// the watch then persists it into its *own* App Group so the watch app and
// its complication can share it on-device.

/// A loggable food/recipe reference shown in the watch's quick-log list
/// (favorites and recents). Carries just enough to render a row and build a
/// log request.
struct WatchFoodRef: Codable, Identifiable, Hashable {
    /// Server/local id of the underlying food (`foodId`) or recipe (`recipeId`).
    let id: String
    let name: String
    /// Calories per serving.
    let calories: Double
    /// `true` when `id` is a recipe id rather than a food id.
    let isRecipe: Bool

    init(id: String, name: String, calories: Double, isRecipe: Bool = false) {
        self.id = id
        self.name = name
        self.calories = calories
        self.isRecipe = isRecipe
    }
}

/// The full "today" state the phone mirrors to the watch. Wraps the existing
/// `WidgetSnapshot` (macros, goals, per-meal totals, favorites, latest weight,
/// locale) and adds the two things the watch's logging UI needs that the
/// widgets don't: the server-driven meal-type list and a recents list.
struct WatchState: Codable {
    let snapshot: WidgetSnapshot
    /// Meal-type keys the watch offers in its log picker. Server-driven — the
    /// phone learns them from the synced log rather than hardcoding, so custom
    /// meal types appear here too.
    let mealTypes: [String]
    /// Recently logged foods, most recent first.
    let recents: [WatchFoodRef]

    static var placeholder: WatchState {
        WatchState(
            snapshot: .placeholder,
            mealTypes: ["breakfast", "lunch", "dinner", "snacks"],
            recents: []
        )
    }

    /// Mirrors `WidgetSnapshot.resetIfStale`: the day-bound macro totals only
    /// hold for the day they were captured, so zero them when rendered on a
    /// later day while keeping goals and reference data.
    func resetIfStale(on referenceDate: Date) -> WatchState {
        WatchState(
            snapshot: snapshot.resetIfStale(on: referenceDate),
            mealTypes: mealTypes,
            recents: recents
        )
    }
}

/// The watch → phone "log this" command. Mirrors `EntryCreate`; the phone
/// turns it back into an `EntryCreate` and runs the real write through
/// `EntryRepository`.
struct WatchLogRequest: Codable {
    var foodId: String?
    var recipeId: String?
    let mealType: String
    let servings: Double
    /// ISO day ("yyyy-MM-dd").
    let date: String
    var quickName: String?
    var quickCalories: Double?
    var quickProtein: Double?
    var quickCarbs: Double?
    var quickFat: Double?
    var quickFiber: Double?
}

/// Dictionary keys for the plist-safe `[String: Any]` payloads WCSession
/// transports. Each value is a JSON `Data` blob (see `WatchPayloadCodec`).
enum WatchPayloadKey {
    /// Phone → watch application context: the encoded `WatchState`.
    static let state = "state"
    /// Watch → phone message/user-info: the encoded `WatchLogRequest`.
    static let logRequest = "logRequest"
    /// Phone → watch reply: the refreshed `WidgetSnapshot` after a log.
    static let snapshot = "snapshot"
}

/// JSON encode/decode helpers. WCSession dictionaries must be plist-safe;
/// `Data` is, so every model crosses the wire as a JSON blob keyed by
/// `WatchPayloadKey`.
enum WatchPayloadCodec {
    static func encode(_ value: some Encodable, key: String) -> [String: Any]? {
        guard let data = try? JSONEncoder().encode(value) else { return nil }
        return [key: data]
    }

    static func decode<T: Decodable>(_ type: T.Type, from payload: [String: Any], key: String) -> T? {
        guard let data = payload[key] as? Data else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }
}
