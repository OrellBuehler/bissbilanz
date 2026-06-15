import Foundation
import SwiftData

/// Central schema and container factory for the local SwiftData store.
///
/// One store holds every model (the data models and the `PendingSyncOperation`
/// queue). In Local (anonymous) mode it mirrors to the user's *private CloudKit
/// database* (`cloudKitEnabled`), giving anonymous users sync across their Apple
/// devices. CloudKit stays **off in Synced mode** — that data already syncs
/// through the backend, so mirroring it too would double-sync and duplicate rows.
///
/// A single store is deliberate: splitting the queue into its own store crashed
/// on-disk saves — SwiftData's persistent-history coalescing throws
/// `-[_NSPersistentHistoryChange initWithDictionary:]` across stores. The queue
/// is therefore CloudKit-mirrored too, but writes are a no-op in Local mode so it
/// stays empty there and never actually syncs.
///
/// `cloudKitDatabase` defaults to `.automatic` on `ModelConfiguration`, so it's
/// set explicitly to `.none` outside Local mode. Tests use the in-memory variant
/// (CloudKit off).
enum LocalStore {
    /// User-facing models — everything except the `PendingSyncOperation` queue.
    static var dataModels: [any PersistentModel.Type] {
        [
            LocalEntry.self,
            LocalFood.self,
            LocalRecipe.self,
            LocalWeightEntry.self,
            LocalSleepEntry.self,
            LocalSupplement.self,
            LocalSupplementLog.self,
            LocalGoals.self,
            LocalPreferences.self,
            LocalDayProperties.self,
        ]
    }

    /// Full union of persisted models. Computed because `Schema` is not
    /// Sendable — a stored static would not be concurrency-safe under Swift 6.
    static var schema: Schema {
        Schema(dataModels + [PendingSyncOperation.self])
    }

    /// Builds the container. `cloudKitEnabled` mirrors the data store to the
    /// user's private CloudKit database — pass `true` only in Local mode.
    static func makeContainer(inMemory: Bool = false, cloudKitEnabled: Bool = false) throws -> ModelContainer {
        // Single store. A multi-store split (queue in its own store) crashes
        // on-disk saves: SwiftData's persistent-history coalescing throws
        // -[_NSPersistentHistoryChange initWithDictionary:] across stores.
        let configuration = if inMemory {
            ModelConfiguration(UUID().uuidString, schema: schema, isStoredInMemoryOnly: true, cloudKitDatabase: .none)
        } else {
            ModelConfiguration(schema: schema, cloudKitDatabase: cloudKitEnabled ? .automatic : .none)
        }
        return try ModelContainer(for: schema, configurations: [configuration])
    }

    /// Builds the container with graceful fallback: CloudKit-mirrored (when
    /// requested) → plain on-disk → in-memory. Falling back to a *plain on-disk*
    /// store when CloudKit setup fails (e.g. an unsigned/un-provisioned build,
    /// or no iCloud account) keeps the user's data intact rather than dropping
    /// to memory. Each failure is reported via `onError`.
    static func makeContainerWithFallback(cloudKitEnabled: Bool, onError: (Error) -> Void) -> ModelContainer {
        if cloudKitEnabled {
            do {
                return try makeContainer(cloudKitEnabled: true)
            } catch {
                onError(error)
            }
        }
        do {
            return try makeContainer(cloudKitEnabled: false)
        } catch {
            onError(error)
            do {
                return try makeContainer(inMemory: true)
            } catch {
                fatalError("Failed to create SwiftData container: \(error)")
            }
        }
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
