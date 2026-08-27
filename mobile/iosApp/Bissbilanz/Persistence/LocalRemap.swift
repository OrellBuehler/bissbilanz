import Foundation
import SwiftData

/// Shared SwiftData mutations for re-keying a local row to a (server) record
/// and rewriting every local reference to the old id. Used by the sync queue
/// (replacing optimistic `temp_` rows once their queued create drains) and by
/// the login migrator (normalization + upload re-keying) — the one place that
/// owns "what points at a food/recipe/supplement id locally".
@MainActor
enum LocalRemap {
    // MARK: - Replacements (old row → new record)

    static func replaceFood(id oldId: String, with food: Food, in context: ModelContext) {
        if let row = foodRow(id: oldId, in: context), food.id != oldId {
            context.delete(row)
        }
        upsertFood(food, in: context)
        remapFoodReferences(from: oldId, to: food.id, in: context)
        try? context.save()
    }

    static func replaceRecipe(id oldId: String, with recipe: Recipe, in context: ModelContext) {
        if let row = recipeRow(id: oldId, in: context), recipe.id != oldId {
            context.delete(row)
        }
        upsertRecipe(recipe, in: context)
        remapRecipeReferences(from: oldId, to: recipe.id, in: context)
        try? context.save()
    }

    static func replaceEntry(id oldId: String, with entry: Entry, date: String, in context: ModelContext) {
        if let row = entryRow(id: oldId, in: context), entry.id != oldId {
            context.delete(row)
        }
        upsertEntry(entry, date: date, in: context)
        try? context.save()
    }

    static func replaceWeight(id oldId: String, with entry: WeightEntry, in context: ModelContext) {
        if let row = weightRow(id: oldId, in: context), entry.id != oldId {
            context.delete(row)
        }
        upsertWeight(entry, in: context)
        try? context.save()
    }

    static func replaceSleep(id oldId: String, with entry: SleepEntry, in context: ModelContext) {
        if let row = sleepRow(id: oldId, in: context), entry.id != oldId {
            context.delete(row)
        }
        upsertSleep(entry, in: context)
        try? context.save()
    }

    static func replaceSupplement(
        id oldId: String,
        with supplement: Supplement,
        rekeyLogIds: Bool,
        in context: ModelContext
    ) {
        if let row = supplementRow(id: oldId, in: context), supplement.id != oldId {
            context.delete(row)
        }
        upsertSupplement(supplement, in: context)
        remapSupplementReferences(from: oldId, to: supplement.id, rekeyLogIds: rekeyLogIds, in: context)
        try? context.save()
    }

    // MARK: - Reference rewriting

    /// Rewrites entry, recipe-ingredient and supplement-ingredient references
    /// to a food id (typed columns and the embedded ids inside `jsonData`).
    static func remapFoodReferences(from oldId: String, to newId: String, in context: ModelContext) {
        guard oldId != newId else { return }
        let entryDescriptor = FetchDescriptor<LocalEntry>(predicate: #Predicate { $0.foodId == oldId })
        for row in (try? context.fetch(entryDescriptor)) ?? [] {
            row.foodId = newId
            if let entry = row.toEntry(),
               let patched = try? JSONPatch.merged(Entry.self, base: entry, patch: ["foodId": newId])
            {
                row.jsonData = LocalStoreCoding.encode(patched)
            }
        }
        // Recipes and supplements keep their ingredient food ids inside the
        // JSON blob, so there is no column to filter on — but a byte search for
        // the id rules a row out far more cheaply than parsing it. Without this
        // the migration's `uploadFoods` loop turned the pass into
        // O(foods × (recipes + supplements)) full JSON round trips, and
        // `normalizeOnce` paid the same before the upload even started.
        guard let needle = oldId.data(using: .utf8) else { return }
        for row in (try? context.fetch(FetchDescriptor<LocalRecipe>())) ?? [] {
            guard row.jsonData.range(of: needle) != nil else { continue }
            if let patched = patchIngredientFoodIds(in: row.jsonData, from: oldId, to: newId) {
                row.jsonData = patched
            }
        }
        for row in (try? context.fetch(FetchDescriptor<LocalSupplement>())) ?? [] {
            guard row.jsonData.range(of: needle) != nil else { continue }
            if let patched = patchIngredientFoodIds(in: row.jsonData, from: oldId, to: newId) {
                row.jsonData = patched
            }
        }
    }

    static func remapRecipeReferences(from oldId: String, to newId: String, in context: ModelContext) {
        guard oldId != newId else { return }
        let descriptor = FetchDescriptor<LocalEntry>(predicate: #Predicate { $0.recipeId == oldId })
        for row in (try? context.fetch(descriptor)) ?? [] {
            row.recipeId = newId
            if let entry = row.toEntry(),
               let patched = try? JSONPatch.merged(Entry.self, base: entry, patch: ["recipeId": newId])
            {
                row.jsonData = LocalStoreCoding.encode(patched)
            }
        }
    }

    /// Rewrites supplement-log rows to a new supplement id. The synthesized
    /// log row id (`"<supplementId>-<date>"`) doubles as the uploaded-marker
    /// during migration: it is only re-keyed during normalization
    /// (`rekeyLogIds` true) or after the log itself was uploaded — NOT when
    /// the owning supplement gets its server id, so a `temp_`-prefixed log id
    /// still means "this log has not been uploaded yet".
    static func remapSupplementReferences(
        from oldId: String,
        to newId: String,
        rekeyLogIds: Bool,
        in context: ModelContext
    ) {
        guard oldId != newId else { return }
        let descriptor = FetchDescriptor<LocalSupplementLog>(predicate: #Predicate { $0.supplementId == oldId })
        for row in (try? context.fetch(descriptor)) ?? [] {
            let keptId = row.id
            let date = row.date
            let takenAt = row.takenAt
            context.delete(row)
            let replacement = LocalSupplementLog(supplementId: newId, date: date, takenAt: takenAt)
            if !rekeyLogIds {
                replacement.id = keptId
            }
            context.insert(replacement)
        }
    }

    // MARK: - Upserts

    static func upsertFood(_ food: Food, in context: ModelContext) {
        if let row = foodRow(id: food.id, in: context) {
            row.update(from: food)
        } else {
            context.insert(LocalFood(food: food))
        }
    }

    static func upsertRecipe(_ recipe: Recipe, in context: ModelContext) {
        if let row = recipeRow(id: recipe.id, in: context) {
            row.update(from: recipe)
        } else {
            context.insert(LocalRecipe(recipe: recipe))
        }
    }

    static func upsertEntry(_ entry: Entry, date: String, in context: ModelContext) {
        if let row = entryRow(id: entry.id, in: context) {
            row.update(from: entry, date: date)
        } else {
            context.insert(LocalEntry(entry: entry, date: date))
        }
    }

    static func upsertWeight(_ entry: WeightEntry, in context: ModelContext) {
        if let row = weightRow(id: entry.id, in: context) {
            row.update(from: entry)
        } else {
            context.insert(LocalWeightEntry(entry: entry))
        }
    }

    static func upsertSleep(_ entry: SleepEntry, in context: ModelContext) {
        if let row = sleepRow(id: entry.id, in: context) {
            row.update(from: entry)
        } else {
            context.insert(LocalSleepEntry(entry: entry))
        }
    }

    static func upsertSupplement(_ supplement: Supplement, in context: ModelContext) {
        if let row = supplementRow(id: supplement.id, in: context) {
            row.update(from: supplement)
        } else {
            context.insert(LocalSupplement(supplement: supplement))
        }
    }

    // MARK: - Row lookups

    static func foodRow(id: String, in context: ModelContext) -> LocalFood? {
        var descriptor = FetchDescriptor<LocalFood>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    static func recipeRow(id: String, in context: ModelContext) -> LocalRecipe? {
        var descriptor = FetchDescriptor<LocalRecipe>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    static func entryRow(id: String, in context: ModelContext) -> LocalEntry? {
        var descriptor = FetchDescriptor<LocalEntry>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    static func weightRow(id: String, in context: ModelContext) -> LocalWeightEntry? {
        var descriptor = FetchDescriptor<LocalWeightEntry>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    static func sleepRow(id: String, in context: ModelContext) -> LocalSleepEntry? {
        var descriptor = FetchDescriptor<LocalSleepEntry>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    static func supplementRow(id: String, in context: ModelContext) -> LocalSupplement? {
        var descriptor = FetchDescriptor<LocalSupplement>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    // MARK: - JSON ingredient patching

    /// Rewrites `ingredients[].foodId` (and the embedded `food.id`) inside an
    /// encoded recipe/supplement payload. Returns nil when nothing referenced
    /// the old id.
    private static func patchIngredientFoodIds(in data: Data, from oldId: String, to newId: String) -> Data? {
        guard var dict = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              var ingredients = dict["ingredients"] as? [[String: Any]]
        else { return nil }

        var changed = false
        for index in ingredients.indices {
            if ingredients[index]["foodId"] as? String == oldId {
                ingredients[index]["foodId"] = newId
                changed = true
            }
            if var food = ingredients[index]["food"] as? [String: Any], food["id"] as? String == oldId {
                food["id"] = newId
                ingredients[index]["food"] = food
                changed = true
            }
        }
        guard changed else { return nil }
        dict["ingredients"] = ingredients
        return try? JSONSerialization.data(withJSONObject: dict)
    }
}
