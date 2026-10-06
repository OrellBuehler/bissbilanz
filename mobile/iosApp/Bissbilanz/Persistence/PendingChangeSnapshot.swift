import Foundation

/// The record an edit started from, captured before the optimistic local write
/// overwrites it, so the pending-changes screen can show old to new per field.
/// Exactly one of the three is set, matching the queued update operation.
struct PendingChangeBefore: Codable {
    var food: Food?
    var entry: Entry?
    var recipe: Recipe?

    init(food: Food? = nil, entry: Entry? = nil, recipe: Recipe? = nil) {
        self.food = food
        self.entry = entry
        self.recipe = recipe.map(Self.slim)
    }

    /// Drops the foods embedded in the ingredients: they are large, and the
    /// ingredient names resolve from the local food store anyway.
    private static func slim(_ recipe: Recipe) -> Recipe {
        var slim = recipe
        slim.ingredients = recipe.ingredients?.map { ingredient in
            RecipeIngredient(
                id: ingredient.id, recipeId: ingredient.recipeId, foodId: ingredient.foodId,
                quantity: ingredient.quantity, servingUnit: ingredient.servingUnit,
                sortOrder: ingredient.sortOrder, food: nil
            )
        }
        return slim
    }
}

private struct PendingChangeBeforeItem: Codable {
    var rowId: String
    var before: PendingChangeBefore
}

/// Durable queue row id to `PendingChangeBefore` lookup. Kept beside the queue
/// rather than on the row (like `QueuedEntrySnapshots`), so rows persisted
/// before this existed decode unchanged and the SwiftData schema does not move;
/// a row without a snapshot just shows the submitted values. Keyed by the row's
/// `id`, which survives temp-id remaps. Bounded, oldest dropped first.
@MainActor
enum PendingChangeSnapshots {
    private static let key = "pending_change_before_snapshots"
    private static let capacity = 200

    /// Keeps the original: a row that already has a snapshot is never
    /// overwritten, so a later write for the same row cannot replace the state
    /// the very first edit started from.
    static func record(rowId: UUID, before: PendingChangeBefore) {
        var items = stored()
        guard !items.contains(where: { $0.rowId == rowId.uuidString }) else { return }
        items.append(PendingChangeBeforeItem(rowId: rowId.uuidString, before: before))
        if items.count > capacity {
            items.removeFirst(items.count - capacity)
        }
        save(items)
    }

    static func lookup(rowId: UUID) -> PendingChangeBefore? {
        stored().last { $0.rowId == rowId.uuidString }?.before
    }

    /// Every snapshot by row id string, read once for a whole list.
    static func all() -> [String: PendingChangeBefore] {
        var result: [String: PendingChangeBefore] = [:]
        for item in stored() {
            result[item.rowId] = item.before
        }
        return result
    }

    static func forget(rowId: UUID) {
        let items = stored()
        let remaining = items.filter { $0.rowId != rowId.uuidString }
        if remaining.count != items.count {
            save(remaining)
        }
    }

    static func forgetAll() {
        UserDefaults.standard.removeObject(forKey: key)
    }

    private static func stored() -> [PendingChangeBeforeItem] {
        guard let data = UserDefaults.standard.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([PendingChangeBeforeItem].self, from: data)) ?? []
    }

    private static func save(_ items: [PendingChangeBeforeItem]) {
        guard let data = try? JSONEncoder().encode(items) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }
}
