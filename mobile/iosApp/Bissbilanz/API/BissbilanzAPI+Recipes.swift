import Foundation

extension BissbilanzAPI {
    // MARK: - Recipes

    func getRecipes() async throws -> [Recipe] {
        let response: RecipesResponse = try await get("/api/recipes")
        return response.recipes
    }

    func getRecipe(id: String) async throws -> Recipe {
        let response: RecipeResponse = try await get("/api/recipes/\(id)")
        return response.recipe
    }

    func getRecipeUsage(id: String) async throws -> WhereUsed {
        try await get("/api/recipes/\(id)/usage")
    }

    func createRecipe(
        _ recipe: RecipeCreate,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> Recipe {
        let response: RecipeResponse = try await post(
            "/api/recipes", body: recipe,
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.recipe
    }

    func updateRecipe(
        id: String,
        _ update: RecipeUpdate,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> Recipe {
        let response: RecipeResponse = try await patch(
            "/api/recipes/\(id)", body: update,
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.recipe
    }

    func deleteRecipe(
        id: String,
        force: Bool = false,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws {
        try await deleteRequest(
            force ? "/api/recipes/\(id)?force=true" : "/api/recipes/\(id)",
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
    }
}
