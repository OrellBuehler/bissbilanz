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
///
/// The on-disk store lives in the `group.com.bissbilanz` App Group container
/// (not the app's private sandbox) so the widget extension can open the same
/// store directly for interactive quick-add — see `migrateStoreToAppGroupIfNeeded`.
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
            LocalReminder.self,
            LocalGoals.self,
            LocalPreferences.self,
            LocalDayProperties.self,
        ]
    }

    /// Full union of persisted models. Computed because `Schema` is not
    /// Sendable — a stored static would not be concurrency-safe under Swift 6.
    static var schema: Schema {
        Schema(versionedSchema: LocalSchemaV2.self)
    }

    /// Builds the container. `cloudKitEnabled` mirrors the data store to the
    /// user's private CloudKit database — pass `true` only in Local mode.
    /// `useMigrationPlan` attaches `LocalMigrationPlan`; the fallback below turns it
    /// off to retry with SwiftData's own inferred migration.
    static func makeContainer(
        inMemory: Bool = false,
        cloudKitEnabled: Bool = false,
        useMigrationPlan: Bool = true,
        onError: (Error, [String: Any]) -> Void = { _, _ in }
    ) throws -> ModelContainer {
        // Single store. A multi-store split (queue in its own store) crashes
        // on-disk saves: SwiftData's persistent-history coalescing throws
        // -[_NSPersistentHistoryChange initWithDictionary:] across stores.
        let configuration: ModelConfiguration
        if inMemory {
            configuration = ModelConfiguration(
                UUID().uuidString, schema: schema, isStoredInMemoryOnly: true, cloudKitDatabase: .none
            )
        } else {
            migrateStoreToAppGroupIfNeeded(onError: onError)
            if let url = appGroupStoreURL {
                configuration = ModelConfiguration(
                    schema: schema,
                    url: url,
                    cloudKitDatabase: cloudKitEnabled ? .automatic : .none
                )
            } else {
                // App Group container unavailable (e.g. an unsigned/un-provisioned
                // local or CI build without the entitlement) — fall back to the
                // app-private default location rather than failing outright. The
                // widget extension simply won't be able to write in that build.
                configuration = ModelConfiguration(
                    schema: schema,
                    cloudKitDatabase: cloudKitEnabled ? .automatic : .none
                )
            }
        }
        if useMigrationPlan {
            return try ModelContainer(
                for: schema,
                migrationPlan: LocalMigrationPlan.self,
                configurations: [configuration]
            )
        }
        return try ModelContainer(for: schema, configurations: [configuration])
    }

    /// `makeContainer` with the migration plan, then without it if that fails. A store
    /// written by an older build can carry a model version the plan does not list;
    /// SwiftData refuses those under a plan but still migrates them on its own.
    private static func makeContainerPreferringPlan(
        cloudKitEnabled: Bool,
        onError: (Error, [String: Any]) -> Void
    ) throws -> ModelContainer {
        do {
            return try makeContainer(cloudKitEnabled: cloudKitEnabled, onError: onError)
        } catch {
            onError(error, ["phase": "store_init_migration_plan"])
            return try makeContainer(cloudKitEnabled: cloudKitEnabled, useMigrationPlan: false, onError: onError)
        }
    }

    /// Builds the container with graceful fallback: CloudKit-mirrored (when
    /// requested) → plain on-disk → in-memory. Falling back to a *plain on-disk*
    /// store when CloudKit setup fails (e.g. an unsigned/un-provisioned build,
    /// or no iCloud account) keeps the user's data intact rather than dropping
    /// to memory. Each failure is reported via `onError`, tagged with a `"phase"`
    /// key so the caller (Sentry in the app, `QuickAddDiagnostics` in the widget
    /// extension) can distinguish container setup from store-migration failures.
    ///
    /// The in-memory step is only for callers that cannot show an error (the app
    /// extensions). The app itself uses `openStore`, which also says when it got there.
    static func makeContainerWithFallback(
        cloudKitEnabled: Bool,
        onError: (Error, [String: Any]) -> Void
    ) -> ModelContainer {
        openStore(cloudKitEnabled: cloudKitEnabled, onError: onError).container
    }

    /// What `openStore` produced. When `unavailable` is set, `container` is an
    /// empty in-memory stand-in and the on-disk store was left exactly as it was.
    struct StoreOpenResult {
        let container: ModelContainer
        let unavailable: StoreUnavailable?
    }

    /// The on-disk store could not be opened. Only reported for Local (anonymous)
    /// mode, where the device holds the only copy of the user's data; Synced mode
    /// re-downloads from the server, so it keeps the quiet in-memory fallback.
    struct StoreUnavailable {
        let error: Error
        /// Copy of the store files taken before falling back, if one could be made.
        let backupURL: URL?
    }

    /// Opens the store, never deleting or rewriting the file on failure. If the
    /// store cannot be opened the files are copied aside once, the failure is
    /// reported, and an empty in-memory container is returned so the app can still
    /// launch. `cloudKitEnabled` is true exactly in Local mode.
    static func openStore(
        cloudKitEnabled: Bool,
        onError: (Error, [String: Any]) -> Void
    ) -> StoreOpenResult {
        if cloudKitEnabled {
            do {
                return StoreOpenResult(
                    container: try makeContainerPreferringPlan(cloudKitEnabled: true, onError: onError),
                    unavailable: nil
                )
            } catch {
                onError(error, ["phase": "store_init_cloudkit"])
            }
        }
        do {
            return StoreOpenResult(
                container: try makeContainerPreferringPlan(cloudKitEnabled: false, onError: onError),
                unavailable: nil
            )
        } catch {
            onError(error, ["phase": "store_init"])
            let backupURL = backUpStoreFiles(onError: onError)
            do {
                return StoreOpenResult(
                    container: try makeContainer(inMemory: true),
                    unavailable: cloudKitEnabled ? StoreUnavailable(error: error, backupURL: backupURL) : nil
                )
            } catch {
                fatalError("Failed to create SwiftData container: \(error)")
            }
        }
    }

    /// Copies the store (and its WAL companions) next to itself, once. The original
    /// stays in place; an existing backup is never overwritten, so the first
    /// failure's snapshot survives repeated launches.
    static func backUpStoreFiles(onError: (Error, [String: Any]) -> Void) -> URL? {
        guard let store = appGroupStoreURL ?? legacyStoreURL else { return nil }
        let fm = FileManager.default
        guard fm.fileExists(atPath: store.path) else { return nil }
        let backup = store.deletingLastPathComponent()
            .appendingPathComponent(store.lastPathComponent + ".unreadable-backup", isDirectory: true)
        if fm.fileExists(atPath: backup.path) { return backup }
        do {
            try fm.createDirectory(at: backup, withIntermediateDirectories: true)
            for suffix in ["", "-wal", "-shm"] {
                let source = URL(fileURLWithPath: store.path + suffix)
                guard fm.fileExists(atPath: source.path) else { continue }
                try fm.copyItem(at: source, to: backup.appendingPathComponent(store.lastPathComponent + suffix))
            }
            return backup
        } catch {
            onError(error, ["phase": "store_backup"])
            return nil
        }
    }

    /// Process-lifetime container for the app extensions, which have no
    /// `BissbilanzApp.init()` to inherit one from.
    ///
    /// `makeContainerWithFallback` re-runs the coordinated App Group store
    /// migration check and, in Local mode, CloudKit container setup — correct,
    /// but a lot to pay for a one-tap widget action, and repeated taps on a
    /// Quick Add widget each paid it again. Keyed on the mode so a change
    /// between taps still rebuilds. Main-actor isolated, as both callers are.
    @MainActor
    private static var sharedExtensionContainer: (cloudKitEnabled: Bool, container: ModelContainer)?

    @MainActor
    static func extensionContainer(
        cloudKitEnabled: Bool,
        onError: (Error, [String: Any]) -> Void
    ) -> ModelContainer {
        if let cached = sharedExtensionContainer, cached.cloudKitEnabled == cloudKitEnabled {
            return cached.container
        }
        let container = makeContainerWithFallback(cloudKitEnabled: cloudKitEnabled, onError: onError)
        sharedExtensionContainer = (cloudKitEnabled, container)
        return container
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

extension LocalStore {
    /// On-disk location inside the App Group container, shared by the app and
    /// the widget extension. Both processes must construct an identical
    /// `Schema` (the full `dataModels` + `PendingSyncOperation`) when opening
    /// this file, even if one side only ever queries a subset of it.
    static var appGroupStoreURL: URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: WidgetSnapshotStore.appGroupId)?
            .appendingPathComponent("Library/Application Support", isDirectory: true)
            .appendingPathComponent("Bissbilanz.store")
    }

    /// The store's location before this change (no explicit `url:` on
    /// `ModelConfiguration`), used only to migrate existing installs' data
    /// into `appGroupStoreURL`. SwiftData's documented default for an
    /// unconfigured `ModelConfiguration` is `default.store` under the app's
    /// `Application Support` directory — verify this on a real device/
    /// simulator before shipping (see the implementation plan's migration
    /// verification checklist); it is not something this change can confirm
    /// without Xcode.
    static var legacyStoreURL: URL? {
        FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)
            .first?
            .appendingPathComponent("default.store")
    }

    private static let migrationLockFilename = ".store-migration.lock"

    /// Idempotent, cross-process-coordinated one-time copy of the pre-App-Group
    /// store. Either the app or the widget extension can be first to run this
    /// after an update ships (e.g. a user taps a pre-existing Favorites widget
    /// before ever reopening the updated app) — `NSFileCoordinator` serializes
    /// the two so only one of them actually performs the copy.
    static func migrateStoreToAppGroupIfNeeded(onError: (Error, [String: Any]) -> Void) {
        guard let containerURL = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: WidgetSnapshotStore.appGroupId),
            let destination = appGroupStoreURL
        else { return }

        let lockURL = containerURL.appendingPathComponent(migrationLockFilename)
        var coordinationError: NSError?
        NSFileCoordinator().coordinate(writingItemAt: lockURL, options: .forReplacing, error: &coordinationError) { _ in
            performMigration(source: legacyStoreURL, destination: destination, onError: onError)
        }
        if let coordinationError {
            onError(coordinationError, ["phase": "store_migration_lock"])
        }
    }

    /// Pure file-system migration step, independent of App Group resolution —
    /// `source`/`destination` are injected so this is directly testable with
    /// temp-directory URLs standing in for the legacy/App-Group locations
    /// (`containerURL(forSecurityApplicationGroupIdentifier:)` isn't available
    /// in a unit-test host).
    static func performMigration(source: URL?, destination: URL, onError: (Error, [String: Any]) -> Void) {
        let fm = FileManager.default
        // Idempotency gate: the main store file's presence at the destination
        // is the single source of truth for "already migrated". The loop below
        // moves it into place LAST, specifically so a crash or disk-full
        // mid-copy never leaves a partial file here that this check would
        // mistake for a completed migration.
        guard !fm.fileExists(atPath: destination.path) else { return }

        do {
            try fm.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
        } catch {
            onError(error, ["phase": "store_migration_mkdir"])
            return
        }

        guard let legacy = source, fm.fileExists(atPath: legacy.path) else {
            return // Fresh install — nothing to migrate, a new store is created at `destination`.
        }

        let staging = destination.deletingLastPathComponent()
            .appendingPathComponent(".migrating-\(UUID().uuidString)", isDirectory: true)
        do {
            try fm.createDirectory(at: staging, withIntermediateDirectories: true)
            // SQLite WAL companion files are optional (absent if the store was
            // last closed cleanly) — copy whichever exist.
            for suffix in ["", "-wal", "-shm"] {
                let sourceFile = URL(fileURLWithPath: legacy.path + suffix)
                guard fm.fileExists(atPath: sourceFile.path) else { continue }
                try fm.copyItem(
                    at: sourceFile,
                    to: staging.appendingPathComponent(destination.lastPathComponent + suffix)
                )
            }
            // Move into place with the main store file last (see idempotency note above).
            for suffix in ["-wal", "-shm", ""] {
                let staged = staging.appendingPathComponent(destination.lastPathComponent + suffix)
                guard fm.fileExists(atPath: staged.path) else { continue }
                try fm.moveItem(at: staged, to: URL(fileURLWithPath: destination.path + suffix))
            }
            try? fm.removeItem(at: staging)
        } catch {
            onError(error, ["phase": "store_migration_copy"])
            try? fm.removeItem(at: staging)
            try? fm.removeItem(at: destination) // Don't leave a half-written store behind.
        }
        // Legacy files are intentionally left in place as a rollback path for
        // at least one release cycle — not deleted here.
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
