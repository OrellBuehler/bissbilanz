@testable import Bissbilanz
import Foundation
import SwiftData
import Testing

@MainActor
struct LocalSchemaTests {
    @Test("V1 lists every persisted model, including the sync queue")
    func versionedSchemaCoversAllModels() {
        #expect(LocalSchemaV1.models.count == LocalStore.dataModels.count + 1)
        #expect(LocalMigrationPlan.schemas.count == 1)
        #expect(LocalMigrationPlan.stages.isEmpty)
    }

    @Test("A store written before versioning opens under the migration plan with its rows intact")
    func existingStoreOpensUnderPlan() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("LocalSchemaTests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("Bissbilanz.store")

        // Written the way builds before versioning did: plain schema, no plan.
        let legacySchema = Schema(LocalStore.dataModels + [PendingSyncOperation.self])
        do {
            let legacy = try ModelContainer(
                for: legacySchema,
                configurations: [ModelConfiguration(schema: legacySchema, url: url, cloudKitDatabase: .none)]
            )
            legacy.mainContext.insert(LocalGoals(goals: .defaults))
            try legacy.mainContext.save()
        }

        let schema = LocalStore.schema
        let container = try ModelContainer(
            for: schema,
            migrationPlan: LocalMigrationPlan.self,
            configurations: [ModelConfiguration(schema: schema, url: url, cloudKitDatabase: .none)]
        )
        #expect(try container.mainContext.fetchCount(FetchDescriptor<LocalGoals>()) == 1)
    }
}
