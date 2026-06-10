import Foundation
import Observation
import SwiftData

/// Local-first repository for the personal food database.
///
/// Favorites, recents and detail reads come from SwiftData; search stays
/// API-first (the server searches the full DB) with a local fallback,
/// mirroring the Android repository. Writes are optimistic: local row first,
/// then the API call, with temp ids replaced by the server record on success.
@MainActor
@Observable
final class FoodRepository {
    private let context: ModelContext
    private let api: BissbilanzAPI

    init(context: ModelContext, api: BissbilanzAPI) {
        self.context = context
        self.api = api
    }

    // MARK: - Reads (local)

    func food(id: String) -> Food? {
        fetchRow(id: id)?.toFood()
    }

    func favorites() -> [Food] {
        let descriptor = FetchDescriptor<LocalFood>(
            predicate: #Predicate { $0.isFavorite },
            sortBy: [SortDescriptor(\.name)]
        )
        let rows = (try? context.fetch(descriptor)) ?? []
        return rows.compactMap { $0.toFood() }
    }

    /// Recents derived from the local entry log — instant render across
    /// launches; `refreshRecentFoods` replaces this with the server ordering.
    func localRecentFoods(limit: Int = 20) -> [Food] {
        let descriptor = FetchDescriptor<LocalEntry>(predicate: #Predicate { $0.foodId != nil })
        let entryRows = (try? context.fetch(descriptor)) ?? []
        var lastDateByFood: [String: String] = [:]
        for row in entryRows {
            guard let foodId = row.foodId else { continue }
            if let current = lastDateByFood[foodId], current >= row.date { continue }
            lastDateByFood[foodId] = row.date
        }
        return lastDateByFood
            .sorted { $0.value > $1.value }
            .prefix(limit)
            .compactMap { food(id: $0.key) }
    }

    func searchLocal(_ query: String, limit: Int = 50) -> [Food] {
        let descriptor = FetchDescriptor<LocalFood>(sortBy: [SortDescriptor(\.name)])
        let rows = (try? context.fetch(descriptor)) ?? []
        return rows
            .filter { row in
                row.name.localizedCaseInsensitiveContains(query)
                    || (row.brand?.localizedCaseInsensitiveContains(query) ?? false)
            }
            .prefix(limit)
            .compactMap { $0.toFood() }
    }

    func findLocalByBarcode(_ barcode: String) -> Food? {
        var descriptor = FetchDescriptor<LocalFood>(predicate: #Predicate { $0.barcode == barcode })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first?.toFood()
    }

    // MARK: - Refresh (API → store)

    func refreshFood(id: String) async throws {
        guard !LocalStore.isTempId(id) else { return }
        let food = try await api.getFood(id: id)
        upsert(food)
        save()
    }

    /// Refreshes favorites and reconciles un-favorited rows. Also caches the
    /// favorite recipes carried in the same response.
    func refreshFavorites() async throws {
        let response = try await api.getFavorites()
        let favoriteIds = Set(response.foods.map(\.id))
        for stale in favorites() where !favoriteIds.contains(stale.id) && !LocalStore.isTempId(stale.id) {
            if let row = fetchRow(id: stale.id), let patched = patchedFavorite(stale, isFavorite: false) {
                row.update(from: patched)
            }
        }
        for food in response.foods {
            upsert(food)
        }
        for recipe in response.recipes ?? [] {
            upsertRecipe(recipe)
        }
        save()
    }

    /// Server-ordered recents (trimmed foods, not cached — mirrors Android);
    /// falls back to the locally derived list when the API is unavailable.
    func refreshRecentFoods(limit: Int = 20) async -> [Food] {
        if let recents = try? await api.getRecentFoods(limit: limit) {
            return recents
        }
        return localRecentFoods(limit: limit)
    }

    /// API-first search over the full server-side food DB; results are cached
    /// and the local store answers when the network is unavailable.
    func searchFoods(query: String) async -> [Food] {
        do {
            let results = try await api.searchFoods(query: query)
            for food in results {
                upsert(food)
            }
            save()
            return results
        } catch {
            return searchLocal(query)
        }
    }

    func findByBarcode(_ barcode: String) async throws -> Food? {
        if let local = findLocalByBarcode(barcode) {
            return local
        }
        guard let food = try await api.findFoodByBarcode(barcode) else { return nil }
        upsert(food)
        save()
        return food
    }

    // MARK: - Writes (local first, then API)

    @discardableResult
    func createFood(_ create: FoodCreate) async throws -> Food {
        let temp = try Self.makeFood(from: create, id: LocalStore.makeTempId())
        upsert(temp)
        save()
        let server = try await api.createFood(create)
        deleteRow(id: temp.id)
        upsert(server)
        save()
        return server
    }

    @discardableResult
    func updateFood(id: String, _ create: FoodCreate) async throws -> Food {
        let optimistic = try Self.makeFood(from: create, id: id)
        upsert(optimistic)
        save()
        guard !LocalStore.isTempId(id) else { return optimistic }
        let server = try await api.updateFood(id: id, create)
        upsert(server)
        save()
        return server
    }

    func deleteFood(id: String) async throws {
        deleteRow(id: id)
        save()
        guard !LocalStore.isTempId(id) else { return }
        try await api.deleteFood(id: id)
    }

    @discardableResult
    func toggleFavorite(foodId: String, isFavorite: Bool) async throws -> Food {
        var optimistic: Food?
        if let row = fetchRow(id: foodId), let current = row.toFood(),
           let patched = patchedFavorite(current, isFavorite: isFavorite)
        {
            row.update(from: patched)
            save()
            optimistic = patched
        }
        if LocalStore.isTempId(foodId), let optimistic {
            return optimistic
        }
        let server = try await api.toggleFavorite(foodId: foodId, isFavorite: isFavorite)
        upsert(server)
        save()
        return server
    }

    // MARK: - Conversion helpers

    static func makeFood(from create: FoodCreate, id: String) throws -> Food {
        try JSONPatch.merged(Food.self, base: create, patch: [
            "id": id,
            "userId": "",
            "isFavorite": create.isFavorite ?? false,
        ])
    }

    private func patchedFavorite(_ food: Food, isFavorite: Bool) -> Food? {
        try? JSONPatch.merged(Food.self, base: food, patch: ["isFavorite": isFavorite])
    }

    // MARK: - Store helpers

    private func fetchRow(id: String) -> LocalFood? {
        var descriptor = FetchDescriptor<LocalFood>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    private func upsert(_ food: Food) {
        if let row = fetchRow(id: food.id) {
            row.update(from: food)
        } else {
            context.insert(LocalFood(food: food))
        }
    }

    private func deleteRow(id: String) {
        if let row = fetchRow(id: id) {
            context.delete(row)
        }
    }

    private func upsertRecipe(_ recipe: Recipe) {
        let id = recipe.id
        var descriptor = FetchDescriptor<LocalRecipe>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        if let row = (try? context.fetch(descriptor))?.first {
            row.update(from: recipe)
        } else {
            context.insert(LocalRecipe(recipe: recipe))
        }
    }

    private func save() {
        try? context.save()
    }
}
