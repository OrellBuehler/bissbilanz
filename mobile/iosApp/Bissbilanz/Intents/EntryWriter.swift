import Foundation
import SwiftData

/// Single, UI- and AppIntents-agnostic entry point for reading the food/recipe
/// catalog and writing a log entry. App Intents (`LogFoodIntent`,
/// `FoodEntityQuery`, …) run in a *separate* invocation of the app — the system
/// background-launches the process to service Siri / Spotlight / Shortcuts — so
/// they can't reach the SwiftUI environment the views use. They resolve this
/// type through `AppDependencyManager` instead.
///
/// It deliberately wraps the existing repositories rather than re-implementing
/// the optimistic-write + sync-enqueue flow: an intent log is the exact same
/// `EntryRepository.createEntry` path the in-app quick-log uses, so it inherits
/// offline-first behaviour, HealthKit write-back and `temp_` reconciliation for
/// free. Kept free of `FoodEntity`/`RecipeEntity` so the Widgets and Watch
/// issues can reuse it from their own extensions.
@MainActor
final class EntryWriter {
    private let entryRepository: EntryRepository
    private let foodRepository: FoodRepository
    private let recipeRepository: RecipeRepository
    private let syncManager: SyncManager

    init(
        entryRepository: EntryRepository,
        foodRepository: FoodRepository,
        recipeRepository: RecipeRepository,
        syncManager: SyncManager
    ) {
        self.entryRepository = entryRepository
        self.foodRepository = foodRepository
        self.recipeRepository = recipeRepository
        self.syncManager = syncManager
    }

    // MARK: - Food reads

    /// API-first search (caches into the local store), local fallback offline
    /// and in Local mode — the same path the in-app search uses.
    func searchFoods(_ query: String) async -> [Food] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return suggestedFoods() }
        return await foodRepository.searchFoods(query: trimmed)
    }

    func food(id: String) -> Food? {
        foodRepository.food(id: id)
    }

    func foods(ids: [String]) -> [Food] {
        ids.compactMap { foodRepository.food(id: $0) }
    }

    /// Favorites first, then recently logged foods — what Siri / Shortcuts show
    /// before the user types. Local store only, so it stays instant.
    func suggestedFoods(limit: Int = 12) -> [Food] {
        var seen = Set<String>()
        var result: [Food] = []
        for food in foodRepository.favorites() + foodRepository.localRecentFoods(limit: limit) {
            if seen.insert(food.id).inserted {
                result.append(food)
            }
            if result.count >= limit { break }
        }
        return result
    }

    // MARK: - Recipe reads

    /// Recipes are a local-first, modest set (no server search endpoint), so a
    /// name/substring filter over the cached list matches the in-app behaviour.
    func searchRecipes(_ query: String) -> [Recipe] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return suggestedRecipes() }
        return recipeRepository.recipes().filter { $0.name.localizedCaseInsensitiveContains(trimmed) }
    }

    func recipe(id: String) -> Recipe? {
        recipeRepository.recipe(id: id)
    }

    func recipes(ids: [String]) -> [Recipe] {
        ids.compactMap { recipeRepository.recipe(id: $0) }
    }

    func suggestedRecipes(limit: Int = 12) -> [Recipe] {
        let favorites = recipeRepository.favoriteRecipes()
        return Array((favorites.isEmpty ? recipeRepository.recipes() : favorites).prefix(limit))
    }

    // MARK: - Writes

    /// Logs a food for `date` (today by default) and, when online and signed
    /// in, waits for the upload so the entry has synced by the time the intent
    /// returns. Offline / Local mode falls through to the normal queued path.
    @discardableResult
    func logFood(
        id: String,
        meal: MealTypeAppEnum,
        servings: Double,
        date: String = DateFormatting.today
    ) async throws -> Entry {
        let food = foodRepository.food(id: id)
        let create = EntryCreate(foodId: id, mealType: meal.serverValue, servings: max(servings, 0.0001), date: date)
        let entry = try await entryRepository.createEntry(create, food: food)
        await syncManager.drainPendingQueue()
        return entry
    }

    @discardableResult
    func logRecipe(
        id: String,
        meal: MealTypeAppEnum,
        servings: Double,
        date: String = DateFormatting.today
    ) async throws -> Entry {
        let recipe = recipeRepository.recipe(id: id)
        let create = EntryCreate(recipeId: id, mealType: meal.serverValue, servings: max(servings, 0.0001), date: date)
        let entry = try await entryRepository.createEntry(create, recipe: recipe)
        await syncManager.drainPendingQueue()
        return entry
    }
}
