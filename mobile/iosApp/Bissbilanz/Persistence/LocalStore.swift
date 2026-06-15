import Foundation
import SwiftData

/// Central schema and container factory for the local SwiftData store.
///
/// The store is split across two configurations that share one container (and
/// therefore one `ModelContext`, so repositories and the sync queue keep using
/// a single context):
///
/// - **Data** — every user-facing model, at the default location in Application
///   Support. Included in iCloud Backup automatically (an explicit goal: a
///   Local-mode user's data, their primary non-re-downloadable store, survives a
///   device restore). In Local mode it also mirrors to the user's *private
///   CloudKit database* (`cloudKitEnabled`), giving anonymous users sync across
///   their Apple devices. CloudKit stays **off in Synced mode** — that data
///   already syncs through the backend, and mirroring it too would double-sync
///   and duplicate rows.
/// - **Pending sync queue** — `PendingSyncOperation` only, in a separate store
///   that is *excluded from backup* and *never* uses CloudKit. The queue is
///   per-device, transient upload state aimed at the backend; restoring or
///   syncing it onto another device would re-upload already-applied operations
///   and create duplicate server records.
///
/// `cloudKitDatabase` defaults to `.automatic` on `ModelConfiguration`, so once
/// the iCloud entitlement exists *both* stores would sync unless told not to —
/// hence the explicit `.none` on the queue (always) and on the data store
/// outside Local mode.
///
/// Tests use the in-memory variant (both configurations in memory, CloudKit off).
enum LocalStore {
    /// User-facing models, persisted in the backed-up (and in Local mode,
    /// CloudKit-mirrored) default store. Listed explicitly because a
    /// multi-configuration container must know which store each model belongs to.
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
        let dataSchema = Schema(dataModels)
        let queueSchema = Schema([PendingSyncOperation.self])
        let configurations: [ModelConfiguration]
        if inMemory {
            // Unique names so simultaneous in-memory containers (unit tests)
            // stay isolated. CloudKit is never used with in-memory stores.
            let suffix = UUID().uuidString
            configurations = [
                ModelConfiguration(
                    "data-\(suffix)",
                    schema: dataSchema,
                    isStoredInMemoryOnly: true,
                    cloudKitDatabase: .none
                ),
                ModelConfiguration(
                    "queue-\(suffix)",
                    schema: queueSchema,
                    isStoredInMemoryOnly: true,
                    cloudKitDatabase: .none
                ),
            ]
        } else {
            configurations = try [
                ModelConfiguration(schema: dataSchema, cloudKitDatabase: cloudKitEnabled ? .automatic : .none),
                ModelConfiguration(schema: queueSchema, url: queueStoreURL(), cloudKitDatabase: .none),
            ]
        }
        return try ModelContainer(for: schema, configurations: configurations)
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

    /// URL of the backup-excluded store file that holds the pending sync queue.
    /// The queue lives in Application Support — not Caches — because the system
    /// must never purge un-uploaded writes under disk pressure.
    private static func queueStoreURL() throws -> URL {
        let appSupport = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let directory = try makeBackupExcludedDirectory(named: "PendingSync", under: appSupport)
        return directory.appendingPathComponent("PendingSync.store")
    }

    /// Creates (if needed) `name` under `parent` and marks the directory
    /// `isExcludedFromBackup`, which covers the SwiftData store plus its
    /// `-wal`/`-shm` sidecars. The flag is re-applied every launch so a
    /// directory left by an older build (or reset by some file operation) is
    /// corrected. Exposed for testing; `queueStoreURL` calls it with
    /// Application Support.
    static func makeBackupExcludedDirectory(named name: String, under parent: URL) throws -> URL {
        var directory = parent.appendingPathComponent(name, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var resourceValues = URLResourceValues()
        resourceValues.isExcludedFromBackup = true
        try directory.setResourceValues(resourceValues)
        return directory
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
