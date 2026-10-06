import Foundation

/// Name and per-serving macros of the food or recipe a queued `create_entry`
/// logs, captured when the entry is enqueued. If the food or recipe never
/// reaches the server (its create was discarded or lost), the entry is logged
/// as a quick entry from this instead of being stranded. Kept beside the queue
/// rather than on the queue row, so rows persisted before this existed decode
/// unchanged and the SwiftData schema does not move.
struct QueuedEntrySnapshot: Codable, Equatable {
    var name: String
    var calories: Double
    var protein: Double
    var carbs: Double
    var fat: Double
    var fiber: Double

    init(name: String, calories: Double, protein: Double, carbs: Double, fat: Double, fiber: Double) {
        self.name = name
        self.calories = calories
        self.protein = protein
        self.carbs = carbs
        self.fat = fat
        self.fiber = fiber
    }

    /// From a (local, optimistic) entry row: its `foodName` and per-serving
    /// macros are exactly what the log screen showed. Nil without a name — a
    /// nameless zero-calorie quick entry would be worse than keeping the
    /// operation parked.
    init?(entry: Entry) {
        let name = (entry.foodName ?? entry.quickName)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !name.isEmpty else { return nil }
        self.init(
            name: name,
            calories: entry.calories ?? entry.quickCalories ?? 0,
            protein: entry.protein ?? entry.quickProtein ?? 0,
            carbs: entry.carbs ?? entry.quickCarbs ?? 0,
            fat: entry.fat ?? entry.quickFat ?? 0,
            fiber: entry.fiber ?? entry.quickFiber ?? 0
        )
    }

    init(food: Food) {
        self.init(
            name: food.name, calories: food.calories, protein: food.protein,
            carbs: food.carbs, fat: food.fat, fiber: food.fiber
        )
    }

    /// A recipe's macros are whole-recipe totals; an entry is per serving.
    init(recipe: Recipe) {
        self.init(
            name: recipe.name,
            calories: recipe.caloriesPerServing ?? 0,
            protein: recipe.proteinPerServing ?? 0,
            carbs: recipe.carbsPerServing ?? 0,
            fat: recipe.fatPerServing ?? 0,
            fiber: recipe.fiberPerServing ?? 0
        )
    }
}

private struct QueuedEntrySnapshotItem: Codable {
    var entryId: String
    var snapshot: QueuedEntrySnapshot
}

/// Durable `create_entry` local id → `QueuedEntrySnapshot` lookup. Bounded,
/// oldest snapshots dropped first.
@MainActor
enum QueuedEntrySnapshots {
    private static let key = "queued_entry_snapshots"
    private static let capacity = 500

    static func record(entryId: String, snapshot: QueuedEntrySnapshot) {
        var items = stored().filter { $0.entryId != entryId }
        items.append(QueuedEntrySnapshotItem(entryId: entryId, snapshot: snapshot))
        if items.count > capacity {
            items.removeFirst(items.count - capacity)
        }
        save(items)
    }

    static func lookup(entryId: String) -> QueuedEntrySnapshot? {
        stored().last { $0.entryId == entryId }?.snapshot
    }

    static func forget(entryId: String) {
        let items = stored()
        let remaining = items.filter { $0.entryId != entryId }
        if remaining.count != items.count {
            save(remaining)
        }
    }

    private static func stored() -> [QueuedEntrySnapshotItem] {
        guard let data = UserDefaults.standard.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([QueuedEntrySnapshotItem].self, from: data)) ?? []
    }

    private static func save(_ items: [QueuedEntrySnapshotItem]) {
        guard let data = try? JSONEncoder().encode(items) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }
}
