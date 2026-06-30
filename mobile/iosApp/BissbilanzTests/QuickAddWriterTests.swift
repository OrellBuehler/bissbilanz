@testable import Bissbilanz
import Foundation
import SwiftData
import Testing

/// `QuickAddFoodIntent` itself can't be unit-tested without a live
/// `ModelContainer`/`AppDependencyManager` context the AppIntents framework
/// sets up, so these exercise the same `QuickAddWriter.write` it delegates
/// to, against the existing `RepositoryHarness` in-memory store.
@MainActor
struct QuickAddWriterTests {
    private func seedFood(_ harness: RepositoryHarness, _ food: Food) throws {
        harness.context.insert(LocalFood(food: food))
        try harness.context.save()
    }

    @Test("Writes the entry locally and queues the upload in Synced mode")
    func writesAndQueuesInSyncedMode() throws {
        let harness = try RepositoryHarness(mode: .synced)
        try seedFood(harness, harness.food(id: "f1", name: "Banana"))

        let entry = try QuickAddWriter.write(
            foodId: "f1", meal: .breakfast, servings: 2, in: harness.context, isLocal: false
        )
        try harness.context.save()

        #expect(entry.foodId == "f1")
        #expect(entry.mealType == "breakfast")
        #expect(entry.servings == 2)
        #expect(harness.entryRepository.entries(date: DateFormatting.today).map(\.id) == [entry.id])
        let queued = harness.syncManager.queuedRows()
        #expect(queued.count == 1)
        #expect(queued.first?.type == "create_entry")
        #expect(queued.first?.affectedId == entry.id)
    }

    @Test("Writes the entry locally without queueing in Local mode")
    func writesWithoutQueueingInLocalMode() throws {
        let harness = try RepositoryHarness(mode: .local)
        try seedFood(harness, harness.food(id: "f1", name: "Banana"))

        let entry = try QuickAddWriter.write(
            foodId: "f1", meal: .lunch, servings: 1, in: harness.context, isLocal: true
        )
        try harness.context.save()

        #expect(harness.entryRepository.entries(date: DateFormatting.today).map(\.id) == [entry.id])
        #expect(harness.syncManager.queuedRows().isEmpty)
    }

    @Test("Fails closed when the food id doesn't resolve to a LocalFood row")
    func failsClosedWhenFoodMissing() throws {
        let harness = try RepositoryHarness(mode: .synced)

        #expect(throws: QuickAddWriter.WriteError.self) {
            try QuickAddWriter.write(
                foodId: "missing", meal: .lunch, servings: 1, in: harness.context, isLocal: false
            )
        }
        #expect(harness.entryRepository.entries(date: DateFormatting.today).isEmpty)
        #expect(harness.syncManager.queuedRows().isEmpty)
    }
}
