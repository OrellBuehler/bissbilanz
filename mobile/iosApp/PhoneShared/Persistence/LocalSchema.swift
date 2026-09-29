import SwiftData

/// The local store's schema, versioned so a future model change can ship an
/// explicit migration stage instead of relying on SwiftData inferring one.
///
/// V1 is the schema as it already exists on devices: no model changed when
/// versioning was introduced, so opening an existing store is a no-op. The next
/// model change adds `LocalSchemaV2` (with the changed models nested in it, so
/// each version keeps its own snapshot) to `LocalMigrationPlan.schemas` and a
/// `MigrationStage` to `stages`.
enum LocalSchemaV1: VersionedSchema {
    static var versionIdentifier: Schema.Version {
        Schema.Version(1, 0, 0)
    }

    static var models: [any PersistentModel.Type] {
        LocalStore.dataModels + [PendingSyncOperation.self]
    }
}

enum LocalMigrationPlan: SchemaMigrationPlan {
    static var schemas: [any VersionedSchema.Type] {
        [LocalSchemaV1.self]
    }

    static var stages: [MigrationStage] {
        []
    }
}
