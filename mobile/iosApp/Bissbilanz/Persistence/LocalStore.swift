import Foundation
import SwiftData

/// Central schema and container factory for the local SwiftData store.
///
/// The default on-disk store lives in Application Support, which is included
/// in iCloud Backup automatically — an explicit project goal. Tests use the
/// in-memory variant.
enum LocalStore {
    /// Computed because `Schema` is not Sendable — a stored static would not be
    /// concurrency-safe under Swift 6.
    static var schema: Schema {
        Schema([
            LocalEntry.self,
            LocalFood.self,
            LocalRecipe.self,
            LocalWeightEntry.self,
            LocalSupplement.self,
            LocalSupplementLog.self,
            LocalGoals.self,
            LocalPreferences.self,
            LocalDayProperties.self,
            PendingSyncOperation.self,
        ])
    }

    static func makeContainer(inMemory: Bool = false) throws -> ModelContainer {
        let schema = schema
        let configuration = if inMemory {
            // Unique name so simultaneous in-memory containers (unit tests) stay isolated.
            ModelConfiguration(UUID().uuidString, schema: schema, isStoredInMemoryOnly: true)
        } else {
            ModelConfiguration(schema: schema)
        }
        return try ModelContainer(for: schema, configurations: [configuration])
    }

    /// Client-generated id prefix for optimistic creates. The "temp_" prefix
    /// matches the Android implementation so the future sync-queue package can
    /// coalesce pending creates the same way on both platforms.
    static let tempIdPrefix = "temp_"

    static func makeTempId() -> String {
        "\(tempIdPrefix)\(UUID().uuidString)"
    }

    static func isTempId(_ id: String) -> Bool {
        id.hasPrefix(tempIdPrefix)
    }
}

/// JSON helpers used by the repositories to derive one Codable value from
/// another (e.g. a full `Food` from a `FoodCreate` plus an id) without
/// hand-writing 60-field memberwise initializers.
enum JSONPatch {
    static func dictionary(of value: some Encodable) throws -> [String: Any] {
        let data = try JSONEncoder().encode(value)
        return try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
    }

    static func decode<T: Decodable>(_ type: T.Type, from dictionary: [String: Any]) throws -> T {
        let data = try JSONSerialization.data(withJSONObject: dictionary)
        return try JSONDecoder().decode(type, from: data)
    }

    /// Overlays `patch` keys onto the encoded form of `base` and decodes the result.
    static func merged<T: Decodable>(_ type: T.Type, base: some Encodable, patch: [String: Any]) throws -> T {
        let combined = try dictionary(of: base).merging(patch) { _, new in new }
        return try decode(type, from: combined)
    }
}
