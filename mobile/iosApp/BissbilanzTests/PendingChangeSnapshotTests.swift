@testable import Bissbilanz
import Foundation
import SwiftData
import Testing

@Suite("Pending change before-snapshots", .serialized)
@MainActor
struct PendingChangeSnapshotTests {
    private func foodBody(name: String = "Cola", barcode: String? = nil) -> FoodCreate {
        var body = FoodCreate(
            name: name, servingSize: 100, servingUnit: .g, calories: 100, protein: 10, carbs: 20, fat: 5, fiber: 3
        )
        body.barcode = barcode
        return body
    }

    private func row(_ harness: RepositoryHarness, type: String) throws -> PendingSyncOperation {
        try #require(harness.syncManager.queuedRows().first { $0.type == type })
    }

    // MARK: - Capture

    @Test("Editing a food captures the record as it was before the edit")
    func foodEditCapturesBefore() async throws {
        let harness = try RepositoryHarness()
        try harness.context.insert(LocalFood(food: harness.food(id: "f1", name: "Cola")))
        try harness.context.save()

        _ = try await harness.foodRepository.updateFood(id: "f1", foodBody(name: "Cola Zero", barcode: "123"))

        let queued = try row(harness, type: "update_food")
        defer { PendingChangeSnapshots.forget(rowId: queued.id) }
        let before = try #require(PendingChangeSnapshots.lookup(rowId: queued.id)?.food)
        #expect(before.name == "Cola")
        #expect(before.barcode == nil)
        #expect(harness.foodRepository.food(id: "f1")?.barcode == "123")
    }

    @Test("Editing an entry captures the entry as it was before the edit")
    func entryEditCapturesBefore() async throws {
        let harness = try RepositoryHarness()
        let seeded = try harness.entry(id: "e1", date: "2026-10-06")
        harness.context.insert(LocalEntry(entry: seeded, date: "2026-10-06"))
        try harness.context.save()

        var update = EntryUpdate()
        update.servings = 3
        _ = try await harness.entryRepository.updateEntry(id: "e1", update)

        let queued = try row(harness, type: "update_entry")
        defer { PendingChangeSnapshots.forget(rowId: queued.id) }
        let before = try #require(PendingChangeSnapshots.lookup(rowId: queued.id)?.entry)
        #expect(before.servings == 1)
    }

    @Test("Editing a recipe captures the recipe without its embedded foods")
    func recipeEditCapturesBefore() async throws {
        let harness = try RepositoryHarness()
        try harness.context.insert(LocalRecipe(recipe: harness.recipe(id: "r1", name: "Porridge")))
        try harness.context.save()

        var update = RecipeUpdate()
        update.name = "Oat porridge"
        _ = try await harness.recipeRepository.updateRecipe(id: "r1", update)

        let queued = try row(harness, type: "update_recipe")
        defer { PendingChangeSnapshots.forget(rowId: queued.id) }
        let before = try #require(PendingChangeSnapshots.lookup(rowId: queued.id)?.recipe)
        #expect(before.name == "Porridge")
        #expect(before.ingredients?.allSatisfy { $0.food == nil } ?? true)
    }

    @Test("A queue row without a snapshot has none to look up")
    func rowWithoutSnapshot() throws {
        let harness = try RepositoryHarness()
        harness.syncManager.enqueue(.updateFood(id: "f1", body: foodBody()))
        let queued = try row(harness, type: "update_food")
        #expect(PendingChangeSnapshots.lookup(rowId: queued.id) == nil)
    }

    // MARK: - Coalescing and cleanup

    @Test("Recording again keeps the original snapshot")
    func recordKeepsOriginal() throws {
        let rowId = UUID()
        defer { PendingChangeSnapshots.forget(rowId: rowId) }
        let original = try PendingChangeBefore(food: RepositoryHarness().food(id: "f1", name: "Original"))
        let later = try PendingChangeBefore(food: RepositoryHarness().food(id: "f1", name: "Later"))

        PendingChangeSnapshots.record(rowId: rowId, before: original)
        PendingChangeSnapshots.record(rowId: rowId, before: later)

        #expect(PendingChangeSnapshots.lookup(rowId: rowId)?.food?.name == "Original")
    }

    @Test("The store is bounded and drops the oldest snapshots first")
    func storeIsBounded() throws {
        let before = try PendingChangeBefore(food: RepositoryHarness().food(id: "f1", name: "Cola"))
        let ids = (0 ..< 205).map { _ in UUID() }
        defer { ids.forEach { PendingChangeSnapshots.forget(rowId: $0) } }

        for id in ids {
            PendingChangeSnapshots.record(rowId: id, before: before)
        }

        #expect(PendingChangeSnapshots.lookup(rowId: ids[0]) == nil)
        #expect(PendingChangeSnapshots.lookup(rowId: ids[204]) != nil)
    }

    @Test("A snapshot survives a payload rewrite of its row")
    func survivesReplace() throws {
        let harness = try RepositoryHarness()
        let before = try PendingChangeBefore(food: harness.food(id: "f1", name: "Cola"))
        harness.syncManager.enqueue(.updateFood(id: "temp_f", body: foodBody()), before: before)
        let queued = try row(harness, type: "update_food")
        defer { PendingChangeSnapshots.forget(rowId: queued.id) }

        harness.syncManager.replace(queued, with: .updateFood(id: "f-server", body: foodBody()))

        #expect(PendingChangeSnapshots.lookup(rowId: queued.id)?.food?.name == "Cola")
    }

    @Test("A drained row drops its snapshot")
    func drainedRowForgets() async throws {
        let harness = try RepositoryHarness()
        harness.stub("POST", "/api/goals", json: "{}")
        let before = try PendingChangeBefore(food: harness.food(id: "f1", name: "Cola"))
        harness.syncManager.enqueue(.setGoals(body: .defaults), before: before)
        let queued = try row(harness, type: "set_goals")
        #expect(PendingChangeSnapshots.lookup(rowId: queued.id) != nil)

        await harness.syncManager.drainPendingQueue()

        #expect(PendingChangeSnapshots.lookup(rowId: queued.id) == nil)
    }

    @Test("A discarded row drops its snapshot")
    func discardedRowForgets() async throws {
        let harness = try RepositoryHarness()
        harness.stub("POST", "/api/goals", status: 400, json: #"{"error": "invalid"}"#)
        let before = try PendingChangeBefore(food: harness.food(id: "f1", name: "Cola"))
        harness.syncManager.enqueue(.setGoals(body: .defaults), before: before)
        let queued = try row(harness, type: "set_goals")
        let rowId = queued.id
        await harness.syncManager.drainPendingQueue()
        let parked = try #require(harness.syncManager.parkedRows().first)
        #expect(PendingChangeSnapshots.lookup(rowId: rowId) != nil)

        harness.syncManager.discardParked(parked)

        #expect(PendingChangeSnapshots.lookup(rowId: rowId) == nil)
    }

    @Test("Removing queued rows for a record drops their snapshots")
    func removeQueuedForgets() throws {
        let harness = try RepositoryHarness()
        let before = try PendingChangeBefore(food: harness.food(id: "f1", name: "Cola"))
        harness.syncManager.enqueue(.updateFood(id: "f1", body: foodBody()), before: before)
        let queued = try row(harness, type: "update_food")
        let rowId = queued.id

        harness.syncManager.removeQueued(table: "foods", affectedId: "f1")

        #expect(PendingChangeSnapshots.lookup(rowId: rowId) == nil)
    }

    @Test("Clearing the queue drops every snapshot")
    func clearQueueForgets() throws {
        let harness = try RepositoryHarness()
        let before = try PendingChangeBefore(food: harness.food(id: "f1", name: "Cola"))
        harness.syncManager.enqueue(.updateFood(id: "f1", body: foodBody()), before: before)
        let rowId = try row(harness, type: "update_food").id

        harness.syncManager.clearQueue()

        #expect(PendingChangeSnapshots.lookup(rowId: rowId) == nil)
    }

    // MARK: - Describer with a before-snapshot

    @Test("A food edit shows old to new from the snapshot even when the local copy is already updated")
    func foodDiffFromSnapshot() throws {
        let harness = try RepositoryHarness()
        let before = try PendingChangeBefore(food: harness.food(id: "f1", name: "Cola"))
        let current = try harness.food(id: "f1", name: "Cola", barcode: "123")
        let lookup = PendingChangeLookup(food: { $0 == "f1" ? current : nil })

        let result = PendingChangeDescriber.details(
            type: "update_food",
            operation: .updateFood(id: "f1", body: foodBody(barcode: "123")),
            lookup: lookup,
            before: before
        )

        #expect(result.summary.extras == [L10n.barcode.lowercased()])
        let section = try #require(result.sections.first)
        #expect(section.title == L10n.pendingDetailChanges)
        let change = try #require(section.fields.first)
        #expect(change.label == L10n.barcode)
        #expect(change.oldValue == "\u{2014}")
        #expect(change.value == "123")
        #expect(result.notes.isEmpty)
    }

    @Test("An entry edit shows servings old to new from the snapshot")
    func entryDiffFromSnapshot() throws {
        let harness = try RepositoryHarness()
        let seeded = try harness.entry(id: "e1", date: "2026-10-06")
        var update = EntryUpdate()
        update.servings = 3

        let result = PendingChangeDescriber.details(
            type: "update_entry",
            operation: .updateEntry(id: "e1", body: update),
            lookup: PendingChangeLookup(),
            before: PendingChangeBefore(entry: seeded)
        )

        #expect(result.summary.extras == [L10n.servings.lowercased()])
        let change = try #require(result.sections.first?.fields.first)
        #expect(change.oldValue == L10n.pendingServingsCount("1", plural: false))
        #expect(change.value == L10n.pendingServingsCount("3", plural: true))
    }

    @Test("A recipe edit shows the old name from the snapshot")
    func recipeDiffFromSnapshot() throws {
        let harness = try RepositoryHarness()
        let seeded = try harness.recipe(id: "r1", name: "Porridge")
        var update = RecipeUpdate()
        update.name = "Oat porridge"

        let result = PendingChangeDescriber.details(
            type: "update_recipe",
            operation: .updateRecipe(id: "r1", body: update),
            lookup: PendingChangeLookup(),
            before: PendingChangeBefore(recipe: seeded)
        )

        let change = try #require(result.sections.first?.fields.first)
        #expect(change.label == L10n.name)
        #expect(change.oldValue == "Porridge")
        #expect(change.value == "Oat porridge")
    }

    @Test("A snapshot identical to the edit falls back to the submitted values")
    func unchangedSnapshotFallsBack() throws {
        let harness = try RepositoryHarness()
        let before = try PendingChangeBefore(food: harness.food(id: "f1", name: "Cola"))

        let result = PendingChangeDescriber.details(
            type: "update_food",
            operation: .updateFood(id: "f1", body: foodBody()),
            lookup: PendingChangeLookup(),
            before: before
        )

        #expect(result.sections.first?.title == L10n.pendingDetailSubmitted)
        #expect(result.notes.isEmpty)
    }

    @Test("The discard message mentions dependent changes")
    func discardMessageWithDependents() {
        let details = PendingChangeDescriber.details(
            type: "create_food",
            operation: .createFood(body: foodBody(), localId: "temp_f"),
            lookup: PendingChangeLookup()
        )

        #expect(details.discardMessage(dependents: 0) == details.discardMessage)
        let message = details.discardMessage(dependents: 2)
        #expect(message.hasPrefix(details.discardMessage))
        #expect(message.hasSuffix(L10n.pendingDiscardDependents(2)))
    }
}
