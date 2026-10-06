import Foundation
import SwiftData

/// The local store's schema, versioned so a model change ships an explicit
/// migration stage instead of relying on SwiftData inferring one.
///
/// A version's models are matched to a store by their hash, so a version has to be
/// the models exactly as an older build defined them, not the live classes. Only
/// `PendingSyncOperation` and `LocalRecipe` have changed since versioning was
/// introduced (v1.52.0 and earlier stores predate it), so V1 nests a frozen copy of
/// the first, `LegacyLocalModels` freezes the second, and the live classes are reused
/// for the rest, which are identical in every version. The next change to an existing
/// model freezes its old shape in a new nested type the same way, and adds a
/// `LocalSchemaV5` and a `MigrationStage`.
enum LocalSchemaV1: VersionedSchema {
    static var versionIdentifier: Schema.Version {
        Schema.Version(1, 0, 0)
    }

    static var models: [any PersistentModel.Type] {
        LegacyLocalModels.dataModels + [PendingSyncOperation.self]
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

/// V1 plus `failedAt` and `failureReason` on the sync queue.
enum LocalSchemaV2: VersionedSchema {
    static var versionIdentifier: Schema.Version {
        Schema.Version(2, 0, 0)
    }

    static var models: [any PersistentModel.Type] {
        LegacyLocalModels.dataModels + [PendingSyncOperation.self]
    }
}

/// V2 plus the bulk upload jobs of a big package import. A new model is all that changed,
/// so the step from V2 is lightweight.
enum LocalSchemaV3: VersionedSchema {
    static var versionIdentifier: Schema.Version {
        Schema.Version(3, 0, 0)
    }

    static var models: [any PersistentModel.Type] {
        LocalSchemaV2.models + [BulkUploadJob.self]
    }
}

/// The current models: V3 plus `LocalRecipe.labels`, so recipes are searched and swept for
/// missing labels like foods. An attribute with a default is all that changed, so the step
/// from V3 is lightweight.
enum LocalSchemaV4: VersionedSchema {
    static var versionIdentifier: Schema.Version {
        Schema.Version(4, 0, 0)
    }

    static var models: [any PersistentModel.Type] {
        LocalStore.dataModels + [PendingSyncOperation.self, BulkUploadJob.self]
    }
}

/// The models whose shape changed after versioning was introduced, frozen as the older
/// versions had them: `LocalRecipe` before it gained `labels`.
enum LegacyLocalModels {
    static var dataModels: [any PersistentModel.Type] {
        [
            LocalEntry.self,
            LocalFood.self,
            LegacyLocalModels.LocalRecipe.self,
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

    @Model
    final class LocalRecipe {
        var id: String = ""
        var name: String = ""
        var totalServings: Double = 0
        var isFavorite: Bool = false
        var calories: Double = 0
        var protein: Double = 0
        var carbs: Double = 0
        var fat: Double = 0
        var fiber: Double = 0
        var jsonData: Data = Data()

        init() {}
    }
}

enum LocalMigrationPlan: SchemaMigrationPlan {
    static var schemas: [any VersionedSchema.Type] {
        [LocalSchemaV1.self, LocalSchemaV2.self, LocalSchemaV3.self, LocalSchemaV4.self]
    }

    static var stages: [MigrationStage] {
        [
            .lightweight(fromVersion: LocalSchemaV1.self, toVersion: LocalSchemaV2.self),
            .lightweight(fromVersion: LocalSchemaV2.self, toVersion: LocalSchemaV3.self),
            .lightweight(fromVersion: LocalSchemaV3.self, toVersion: LocalSchemaV4.self),
        ]
    }
}
