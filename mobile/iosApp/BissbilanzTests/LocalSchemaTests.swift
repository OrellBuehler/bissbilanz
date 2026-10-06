@testable import Bissbilanz
import Foundation
import SwiftData
import Testing

@MainActor
struct LocalSchemaTests {
    @Test("Every version lists every persisted model, including the sync queue")
    func versionedSchemaCoversAllModels() {
        #expect(LocalSchemaV1.models.count == LocalStore.dataModels.count + 1)
        #expect(LocalSchemaV2.models.count == LocalStore.dataModels.count + 1)
        #expect(LocalSchemaV3.models.count == LocalStore.dataModels.count + 2)
        #expect(LocalMigrationPlan.schemas.count == 3)
        #expect(LocalMigrationPlan.stages.count == 2)
    }

    @Test("A store written by v1.52.0 migrates to the current schema with its rows intact")
    func existingStoreOpensUnderPlan() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("LocalSchemaTests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("Bissbilanz.store")

        // Written the way v1.52.0 did: no plan, and a sync queue without the parking columns.
        let legacySchema = Schema(versionedSchema: LocalSchemaV1.self)
        do {
            let legacy = try ModelContainer(
                for: legacySchema,
                configurations: [ModelConfiguration(schema: legacySchema, url: url, cloudKitDatabase: .none)]
            )
            legacy.mainContext.insert(LocalGoals(goals: .defaults))
            legacy.mainContext.insert(LocalSchemaV1.PendingSyncOperation())
            try legacy.mainContext.save()
        }

        let schema = LocalStore.schema
        let container = try ModelContainer(
            for: schema,
            migrationPlan: LocalMigrationPlan.self,
            configurations: [ModelConfiguration(schema: schema, url: url, cloudKitDatabase: .none)]
        )
        #expect(try container.mainContext.fetchCount(FetchDescriptor<LocalGoals>()) == 1)
        let queue = try container.mainContext.fetch(FetchDescriptor<PendingSyncOperation>())
        #expect(queue.count == 1)
        #expect(queue.first?.failedAt == nil)
        #expect(try container.mainContext.fetchCount(FetchDescriptor<BulkUploadJob>()) == 0)
    }
}
