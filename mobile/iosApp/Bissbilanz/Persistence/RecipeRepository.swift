import Foundation
import Observation
import SwiftData

/// Local-first repository for recipes. List/detail reads come from SwiftData;
/// `refresh()` upserts the server list by id (Android parity). Writes are
/// SwiftData-first with the upload queued via the sync manager; macros stay
/// nil on optimistic rows because they are computed server-side. In Local
/// mode nothing is queued and refreshes are no-ops.
@MainActor
@Observable
final class RecipeRepository {
    private let context: ModelContext
    private let api: BissbilanzAPI
    private let appMode: AppModeManager
    private let syncManager: SyncManager

    init(context: ModelContext, api: BissbilanzAPI, appMode: AppModeManager, syncManager: SyncManager) {
        self.context = context
        self.api = api
        self.appMode = appMode
        self.syncManager = syncManager
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
        guard !appMode.isLocal else { return }
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
        guard !appMode.isLocal, !LocalStore.isTempId(id) else { return }
        let recipe = try await api.getRecipe(id: id)
        upsert(recipe)
        save()
    }

    // MARK: - Writes (local first + queued upload)

    @discardableResult
    func createRecipe(_ create: RecipeCreate) async throws -> Recipe {
        let temp = makeRecipe(from: create, id: LocalStore.makeTempId())
        upsert(temp)
        save()
        syncManager.enqueue(.createRecipe(body: create, localId: temp.id))
        return temp
    }

    @discardableResult
    func updateRecipe(id: String, _ update: RecipeUpdate) async throws -> Recipe {
        var optimistic: Recipe?
        if let row = fetchRow(id: id), let existing = row.toRecipe() {
            // Scalar fields only — update ingredients are inputs, not the
            // full resolved shape; a refresh replaces them server-side.
            var patch = (try? JSONPatch.dictionary(of: update)) ?? [:]
            patch.removeValue(forKey: "ingredients")
            let updated = (try? JSONPatch.merged(Recipe.self, base: existing, patch: patch)) ?? existing
            row.update(from: updated)
            save()
            optimistic = updated
        }
        if LocalStore.isTempId(id) {
            coalesceQueuedCreate(tempId: id, update: update)
        } else {
            syncManager.enqueue(.updateRecipe(id: id, body: update))
        }
        if let optimistic {
            return optimistic
        }
        throw APIError.notFound
    }

    func deleteRecipe(id: String) async throws {
        deleteRow(id: id)
        save()
        if LocalStore.isTempId(id) {
            syncManager.removeQueued(table: "recipes", affectedId: id)
        } else {
            syncManager.enqueue(.deleteRecipe(id: id))
        }
    }

    /// Rewrites the still-queued create for a temp-id recipe so the eventual
    /// upload carries the edited values.
    private func coalesceQueuedCreate(tempId: String, update: RecipeUpdate) {
        for row in syncManager.queuedOperations(table: "recipes", affectedId: tempId) {
            guard let operation = row.operation(),
                  case let .createRecipe(body, localId) = operation
            else { continue }
            let patch = (try? JSONPatch.dictionary(of: update)) ?? [:]
            let merged = (try? JSONPatch.merged(RecipeCreate.self, base: body, patch: patch)) ?? body
            syncManager.replace(row, with: .createRecipe(body: merged, localId: localId))
        }
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
        LocalRemap.foodRow(id: id, in: context)?.toFood()
    }

    private func save() {
        try? context.save()
    }
}
