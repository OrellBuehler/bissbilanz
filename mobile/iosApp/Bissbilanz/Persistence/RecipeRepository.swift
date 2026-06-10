import Foundation
import Observation
import SwiftData

/// Local-first repository for recipes. List/detail reads come from SwiftData;
/// `refresh()` upserts the server list by id (Android parity). Writes are
/// optimistic with temp ids replaced by the server record; macros stay nil on
/// optimistic rows because they are computed server-side.
@MainActor
@Observable
final class RecipeRepository {
    private let context: ModelContext
    private let api: BissbilanzAPI

    init(context: ModelContext, api: BissbilanzAPI) {
        self.context = context
        self.api = api
    }

    // MARK: - Reads (local)

    func recipes() -> [Recipe] {
        let descriptor = FetchDescriptor<LocalRecipe>(sortBy: [SortDescriptor(\.name)])
        let rows = (try? context.fetch(descriptor)) ?? []
        return rows.compactMap { $0.toRecipe() }
    }

    func favoriteRecipes() -> [Recipe] {
        let descriptor = FetchDescriptor<LocalRecipe>(
            predicate: #Predicate { $0.isFavorite },
            sortBy: [SortDescriptor(\.name)]
        )
        let rows = (try? context.fetch(descriptor)) ?? []
        return rows.compactMap { $0.toRecipe() }
    }

    func recipe(id: String) -> Recipe? {
        fetchRow(id: id)?.toRecipe()
    }

    // MARK: - Refresh (API → store)

    func refresh() async throws {
        let fetched = try await api.getRecipes()
        let serverIds = Set(fetched.map(\.id))
        // The list endpoint is the complete set — drop rows deleted elsewhere
        // (keeping optimistic temp rows the server doesn't know about yet).
        for stale in recipes() where !serverIds.contains(stale.id) && !LocalStore.isTempId(stale.id) {
            deleteRow(id: stale.id)
        }
        for recipe in fetched {
            upsert(recipe)
        }
        save()
    }

    func refreshRecipe(id: String) async throws {
        guard !LocalStore.isTempId(id) else { return }
        let recipe = try await api.getRecipe(id: id)
        upsert(recipe)
        save()
    }

    // MARK: - Writes (local first, then API)

    @discardableResult
    func createRecipe(_ create: RecipeCreate) async throws -> Recipe {
        let temp = makeRecipe(from: create, id: LocalStore.makeTempId())
        upsert(temp)
        save()
        let server = try await api.createRecipe(create)
        deleteRow(id: temp.id)
        upsert(server)
        save()
        return server
    }

    @discardableResult
    func updateRecipe(id: String, _ update: RecipeUpdate) async throws -> Recipe {
        var optimistic: Recipe?
        if let row = fetchRow(id: id), let existing = row.toRecipe() {
            // Scalar fields only — update ingredients are inputs, not the
            // full resolved shape; the server response replaces them below.
            var patch = (try? JSONPatch.dictionary(of: update)) ?? [:]
            patch.removeValue(forKey: "ingredients")
            let updated = (try? JSONPatch.merged(Recipe.self, base: existing, patch: patch)) ?? existing
            row.update(from: updated)
            save()
            optimistic = updated
        }
        if LocalStore.isTempId(id), let optimistic {
            return optimistic
        }
        let server = try await api.updateRecipe(id: id, update)
        upsert(server)
        save()
        return server
    }

    func deleteRecipe(id: String) async throws {
        deleteRow(id: id)
        save()
        guard !LocalStore.isTempId(id) else { return }
        try await api.deleteRecipe(id: id)
    }

    // MARK: - Conversion helpers

    private func makeRecipe(from create: RecipeCreate, id: String) -> Recipe {
        let ingredients = create.ingredients.enumerated().map { index, input in
            RecipeIngredient(
                id: nil,
                recipeId: id,
                foodId: input.foodId,
                quantity: input.quantity,
                servingUnit: input.servingUnit,
                sortOrder: index,
                food: localFood(id: input.foodId)
            )
        }
        return Recipe(
            id: id,
            userId: "",
            name: create.name,
            totalServings: create.totalServings,
            isFavorite: create.isFavorite ?? false,
            imageUrl: create.imageUrl,
            calories: nil,
            protein: nil,
            carbs: nil,
            fat: nil,
            fiber: nil,
            createdAt: ISO8601DateFormatter().string(from: Date()),
            updatedAt: nil,
            ingredients: ingredients
        )
    }

    // MARK: - Store helpers

    private func fetchRow(id: String) -> LocalRecipe? {
        var descriptor = FetchDescriptor<LocalRecipe>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    private func upsert(_ recipe: Recipe) {
        if let row = fetchRow(id: recipe.id) {
            row.update(from: recipe)
        } else {
            context.insert(LocalRecipe(recipe: recipe))
        }
    }

    private func deleteRow(id: String) {
        if let row = fetchRow(id: id) {
            context.delete(row)
        }
    }

    private func localFood(id: String) -> Food? {
        var descriptor = FetchDescriptor<LocalFood>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first?.toFood()
    }

    private func save() {
        try? context.save()
    }
}
