import Foundation
import SwiftData

/// The local store's schema, versioned so a model change ships an explicit
/// migration stage instead of relying on SwiftData inferring one.
///
/// A version's models are matched to a store by their hash, so a version has to be
/// the models exactly as an older build defined them, not the live classes. Only
/// `PendingSyncOperation` has changed since versioning was introduced (v1.52.0 and
/// earlier stores predate it), so V1 nests a frozen copy of that one model and
/// reuses the live classes for the rest, which are identical in both versions. The
/// next change to a model freezes its old shape in a new nested type the same way,
/// and adds a `LocalSchemaV3` and a `MigrationStage`.
enum LocalSchemaV1: VersionedSchema {
    static var versionIdentifier: Schema.Version {
        Schema.Version(1, 0, 0)
    }

    static var models: [any PersistentModel.Type] {
        LocalStore.dataModels + [PendingSyncOperation.self]
    }

    /// `PendingSyncOperation` as v1.52.0 shipped it, before rows could be parked.
    @Model
    final class PendingSyncOperation {
        var id: UUID = UUID()
        var seq: Int = 0
        var createdAt: Date = Date()
        var type: String = ""
        var payload: Data = Data()
        var affectedTable: String?
        var affectedId: String?
        var retryCount: Int = 0
        var idempotencyKey: String = UUID().uuidString
        var clientEditedAt: String = DateFormatting.isoDateTimeString(from: Date())
        var nextAttemptAt: Date = Date.distantPast

        init() {}
    }
}

/// The current models: V1 plus `failedAt` and `failureReason` on the sync queue.
enum LocalSchemaV2: VersionedSchema {
    static var versionIdentifier: Schema.Version {
        Schema.Version(2, 0, 0)
    }

    static var models: [any PersistentModel.Type] {
        LocalStore.dataModels + [PendingSyncOperation.self]
    }
}

enum LocalMigrationPlan: SchemaMigrationPlan {
    static var schemas: [any VersionedSchema.Type] {
        [LocalSchemaV1.self, LocalSchemaV2.self]
    }

    static var stages: [MigrationStage] {
        [.lightweight(fromVersion: LocalSchemaV1.self, toVersion: LocalSchemaV2.self)]
    }
}
