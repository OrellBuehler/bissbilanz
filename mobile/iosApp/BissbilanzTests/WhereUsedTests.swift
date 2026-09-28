@testable import Bissbilanz
import Foundation
import SwiftData
import Testing

/// The blocked-delete rules and where-used lists, in Local mode (computed from
/// the local store, no server) and Synced mode (parsed from the server's 409 and
/// usage endpoints).
@Suite("Where used")
@MainActor
struct WhereUsedTests {
    private func seedFood(_ harness: RepositoryHarness, _ id: String) throws {
        try harness.context.insert(LocalFood(food: harness.food(id: id, name: "Food \(id)")))
        try harness.context.save()
    }

    private func recipe(
        _ harness: RepositoryHarness,
        name: String,
        foodIds: [String]
    ) async throws -> Recipe {
        try await harness.recipeRepository.createRecipe(RecipeCreate(
            name: name,
            totalServings: 2,
            ingredients: foodIds.map { RecipeIngredientInput(foodId: $0, quantity: 100, servingUnit: .g) }
        ))
    }

    @Test("Local mode deletes a food nothing references")
    func localUnreferencedFoodIsDeleted() async throws {
        let harness = try RepositoryHarness(mode: .local)
        try seedFood(harness, "f1")

        let outcome = try await harness.foodRepository.deleteFoodChecked(id: "f1")

        guard case .deleted = outcome else {
            Issue.record("expected deleted, got \(outcome)")
            return
        }
        #expect(harness.foodRepository.food(id: "f1") == nil)
    }

    @Test("Local mode blocks the last ingredient of a recipe and refuses to force it")
    func localLastIngredientIsBlocked() async throws {
        let harness = try RepositoryHarness(mode: .local)
        let foodRepo = harness.foodRepository
        try seedFood(harness, "only")
        let solo = try await recipe(harness, name: "Solo", foodIds: ["only"])

        let outcome = try await foodRepo.deleteFoodChecked(id: "only")

        guard case let .blocked(conflict) = outcome else {
            Issue.record("expected blocked, got \(outcome)")
            return
        }
        #expect(conflict.lastIngredientRecipes?.map(\.id) == [solo.id])
        #expect(conflict.forceUnavailable)
        await #expect(throws: APIError.self) { try await foodRepo.forceDeleteFood(id: "only") }
        #expect(foodRepo.food(id: "only") != nil)
    }

    @Test("Local mode force delete removes the food from recipes that keep other ingredients")
    func localForceDeleteStripsIngredient() async throws {
        let harness = try RepositoryHarness(mode: .local)
        let foodRepo = harness.foodRepository
        try seedFood(harness, "extra")
        try seedFood(harness, "base")
        let mixed = try await recipe(harness, name: "Mixed", foodIds: ["base", "extra"])
        _ = try await harness.entryRepository.createEntry(
            EntryCreate(foodId: "extra", mealType: "lunch", servings: 1, date: "2026-06-01"),
            food: harness.food(id: "extra", name: "Food extra")
        )

        let outcome = try await foodRepo.deleteFoodChecked(id: "extra")

        guard case let .blocked(conflict) = outcome else {
            Issue.record("expected blocked, got \(outcome)")
            return
        }
        #expect(conflict.entryCount == 1)
        #expect(conflict.recipeCount == 1)
        #expect(!conflict.forceUnavailable)

        try await foodRepo.forceDeleteFood(id: "extra")

        #expect(foodRepo.food(id: "extra") == nil)
        let remaining = harness.recipeRepository.recipe(id: mixed.id)?.ingredients ?? []
        #expect(remaining.map(\.foodId) == ["base"])
        #expect(remaining.map(\.sortOrder) == [0])
    }

    @Test("Local mode supplement ingredient blocks the delete and disables force")
    func localSupplementIngredientBlocks() async throws {
        let harness = try RepositoryHarness(mode: .local)
        try seedFood(harness, "salt")
        _ = try await harness.supplementRepository.createSupplement(SupplementCreate(
            name: "Electrolytes",
            scheduleType: .daily,
            ingredients: [SupplementIngredientInput(foodId: "salt", servings: 1)]
        ))

        let outcome = try await harness.foodRepository.deleteFoodChecked(id: "salt")

        guard case let .blocked(conflict) = outcome else {
            Issue.record("expected blocked, got \(outcome)")
            return
        }
        #expect(conflict.supplementIngredientCount == 1)
        #expect(conflict.forceUnavailable)
    }

    @Test("Local mode where-used lists a recipe's entries newest first")
    func localRecipeWhereUsed() async throws {
        let harness = try RepositoryHarness(mode: .local)
        try seedFood(harness, "oats")
        let porridge = try await recipe(harness, name: "Porridge", foodIds: ["oats"])
        for date in ["2026-06-01", "2026-06-03", "2026-06-02"] {
            _ = try await harness.entryRepository.createEntry(
                EntryCreate(recipeId: porridge.id, mealType: "lunch", servings: 1, date: date),
                recipe: porridge
            )
        }

        let usage = try await harness.recipeRepository.whereUsed(id: porridge.id)
        let outcome = try await harness.recipeRepository.deleteRecipeChecked(id: porridge.id)

        #expect(usage.totalEntries == 3)
        #expect(usage.entries.map(\.date) == ["2026-06-03", "2026-06-02", "2026-06-01"])
        guard case let .blocked(conflict) = outcome else {
            Issue.record("expected blocked, got \(outcome)")
            return
        }
        #expect(conflict.entryCount == 3)
    }

    @Test("Local mode where-used lists a food's recipes with the last-ingredient flag and its supplements")
    func localFoodWhereUsed() async throws {
        let harness = try RepositoryHarness(mode: .local)
        try seedFood(harness, "salt")
        try seedFood(harness, "pepper")
        let solo = try await recipe(harness, name: "Only salt", foodIds: ["salt"])
        let shared = try await recipe(harness, name: "Salt and pepper", foodIds: ["salt", "pepper"])

        let usage = try await harness.foodRepository.whereUsed(id: "salt")

        #expect(usage.recipes.map(\.id) == [solo.id, shared.id])
        #expect(usage.recipes.map(\.isLastIngredient) == [true, false])
    }

    @Test("Synced mode reads last-ingredient recipes from the 409 body and the usage endpoints")
    func syncedConflictAndUsage() async throws {
        let harness = try RepositoryHarness(mode: .synced)
        harness.stub(
            "DELETE", "/api/foods/f1", status: 409,
            json: """
            {"error":"has_entries","entryCount":0,"ingredientCount":1,"recipeCount":1,\
            "lastIngredientRecipes":[{"id":"r1","name":"Porridge"}]}
            """
        )
        harness.stub(
            "GET", "/api/foods/f1/usage",
            json: """
            {"entries":[{"id":"e1","date":"2026-06-03","mealType":"Dinner","servings":2,\
            "eatenAt":"2026-06-03T18:30:00.000Z"}],"totalEntries":1,\
            "recipes":[{"id":"r1","name":"Porridge","isLastIngredient":true}],"supplements":[]}
            """
        )

        let outcome = try await harness.foodRepository.deleteFoodChecked(id: "f1")
        let usage = try await harness.foodRepository.whereUsed(id: "f1")

        guard case let .blocked(conflict) = outcome else {
            Issue.record("expected blocked, got \(outcome)")
            return
        }
        #expect(conflict.lastIngredientRecipes?.map(\.name) == ["Porridge"])
        #expect(conflict.forceUnavailable)
        #expect(usage.entries.map(\.id) == ["e1"])
        #expect(usage.recipes.map(\.isLastIngredient) == [true])
    }
}
