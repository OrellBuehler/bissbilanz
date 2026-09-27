@testable import Bissbilanz
import Foundation
import Testing

@Suite("AI task draft disk")
struct AiTaskDraftDiskTests {
    private func tempRoot() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("ai-task-draft-tests-\(UUID().uuidString)", isDirectory: true)
    }

    private func sampleDraft(taskId: String, queuedAt: Date) -> ProcessedAiTaskDraft {
        let matchedItem = MealEstimateItem(
            name: "Greek yogurt", matchedFoodId: "food-1", quantityDescription: "1 serving",
            grams: nil, servings: 1, calories: 120, protein: 10, carbs: 8, fat: 4, fiber: 0, confidence: 1
        )
        let pendingKey = AiTaskProcessor.pendingFoodKey()
        let pendingItem = MealEstimateItem(
            name: "Muesli bar", matchedFoodId: pendingKey, quantityDescription: "1 serving",
            grams: nil, servings: 1, calories: 180, protein: 3, carbs: 22, fat: 8, fiber: 2, confidence: 1
        )
        let create = AiTaskProcessor.foodCreate(
            from: ParsedNutrition(calories: 180, protein: 3, carbs: 22, fat: 8, fiber: 2),
            name: "Muesli bar",
            barcode: "4006381333931"
        )
        return ProcessedAiTaskDraft(
            taskId: taskId,
            date: "2026-09-27",
            mealType: "Lunch",
            eatenAt: "2026-09-27T12:30:00Z",
            items: [matchedItem, pendingItem],
            pendingFoods: [pendingKey: create],
            source: .onDevice,
            queuedAt: queuedAt
        )
    }

    @Test("Round-trips a draft with a matched item and a pending food, oldest first")
    func roundTrip() throws {
        let root = tempRoot()
        defer { try? FileManager.default.removeItem(at: root) }

        let older = sampleDraft(taskId: "task-older", queuedAt: Date(timeIntervalSince1970: 1000))
        let newer = sampleDraft(taskId: "task-newer", queuedAt: Date(timeIntervalSince1970: 2000))
        try AiTaskDraftDisk.save(newer, root: root)
        try AiTaskDraftDisk.save(older, root: root)

        let all = AiTaskDraftDisk.loadAll(root: root)
        #expect(all.map(\.taskId) == ["task-older", "task-newer"])

        // `MealEstimateItem.id` is a `let id = UUID()` generated fresh on every
        // decode (Swift never round-trips a `let` with a default initializer —
        // see the "will not be decoded" compiler warning on that property), so
        // comparing the whole draft with `==` would fail on `items[n].id` alone
        // even though every field that matters round-tripped correctly.
        let loaded = try #require(AiTaskDraftDisk.load(taskId: "task-older", root: root))
        #expect(loaded.taskId == older.taskId)
        #expect(loaded.date == older.date)
        #expect(loaded.mealType == older.mealType)
        #expect(loaded.eatenAt == older.eatenAt)
        #expect(loaded.source == older.source)
        #expect(loaded.queuedAt == older.queuedAt)
        #expect(loaded.items.map(\.name) == older.items.map(\.name))
        #expect(loaded.items.map(\.matchedFoodId) == older.items.map(\.matchedFoodId))
        #expect(loaded.items.map(\.calories) == older.items.map(\.calories))
        #expect(loaded.pendingFoods.count == 1)
        let pendingKey = older.items[1].matchedFoodId!
        #expect(loaded.pendingFoods[pendingKey]?.barcode == "4006381333931")
        #expect(loaded.pendingFoods[pendingKey] == older.pendingFoods[pendingKey])

        AiTaskDraftDisk.remove(taskId: "task-older", root: root)
        #expect(AiTaskDraftDisk.loadAll(root: root).map(\.taskId) == ["task-newer"])
        #expect(AiTaskDraftDisk.load(taskId: "task-older", root: root) == nil)
    }

    @Test("Ignores unrelated files in the drafts directory")
    func ignoresUnrelatedFiles() throws {
        let root = tempRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try Data("not json".utf8).write(to: root.appendingPathComponent("stray.txt"))
        #expect(AiTaskDraftDisk.loadAll(root: root).isEmpty)
    }

    @Test("Loading a missing task returns nil")
    func loadMissingReturnsNil() {
        let root = tempRoot()
        #expect(AiTaskDraftDisk.load(taskId: "does-not-exist", root: root) == nil)
    }
}
