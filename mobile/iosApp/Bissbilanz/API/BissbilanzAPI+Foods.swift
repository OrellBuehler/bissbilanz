import Foundation

extension BissbilanzAPI {
    // MARK: - Foods

    func searchFoods(query: String) async throws -> [Food] {
        let response: FoodsResponse = try await get("/api/foods", params: ["q": query])
        return response.foods
    }

    func getFoods(limit: Int = 100, offset: Int = 0) async throws -> [Food] {
        let response: FoodsResponse = try await get(
            "/api/foods",
            params: ["limit": "\(limit)", "offset": "\(offset)"]
        )
        return response.foods
    }

    func getRecentFoods(limit: Int = 20) async throws -> [Food] {
        let response: FoodsResponse = try await get("/api/foods/recent", params: ["limit": "\(limit)"])
        return response.foods
    }

    func getFavorites() async throws -> FavoritesResponse {
        try await get("/api/favorites")
    }

    func getFood(id: String) async throws -> Food {
        let response: FoodResponse = try await get("/api/foods/\(id)")
        return response.food
    }

    func getFoodUsage(id: String) async throws -> WhereUsed {
        try await get("/api/foods/\(id)/usage")
    }

    func createFood(
        _ food: FoodCreate,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> Food {
        let response: FoodResponse = try await post(
            "/api/foods", body: food,
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.food
    }

    func updateFood(
        id: String,
        _ food: FoodCreate,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> Food {
        let response: FoodResponse = try await patch(
            "/api/foods/\(id)", body: food,
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.food
    }

    func deleteFood(
        id: String,
        force: Bool = false,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws {
        try await deleteRequest(
            force ? "/api/foods/\(id)?force=true" : "/api/foods/\(id)",
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
    }

    func findFoodByBarcode(_ barcode: String) async throws -> Food? {
        let response: FoodsResponse = try await get("/api/foods", params: ["barcode": barcode])
        return response.foods.first
    }

    /// Sets a food's labels. With `source`/`mode` both nil this is a user
    /// write — the source defaults to `user` server-side and replaces
    /// everything, which makes it authoritative over anything a labeller
    /// seeded. `FoodAutoLabeler`/the "Suggest labels" button instead pass
    /// `source: "llm", mode: "extend"`, which only adds the given labels
    /// without touching the user's own. A 409 means a newer edit already won
    /// last-write-wins.
    func setFoodLabels(
        id: String,
        labels: [String],
        source: String? = nil,
        mode: String? = nil,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> FoodLabelsSetResponse {
        try await put(
            "/api/foods/\(id)/labels",
            body: FoodLabelsSetBody(labels: labels, source: source, mode: mode),
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
    }

    func toggleFavorite(
        foodId: String,
        isFavorite: Bool,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> Food {
        let body = ["isFavorite": isFavorite]
        let response: FoodResponse = try await patch(
            "/api/foods/\(foodId)", body: body,
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.food
    }

    /// Server-computed candidate groups for foods that may be the same
    /// product — see `FoodDuplicateGroup`. No params: it scans the whole
    /// personal food database.
    func getFoodDuplicates() async throws -> [FoodDuplicateGroup] {
        let response: FoodDuplicatesResponse = try await get("/api/foods/duplicates")
        return response.groups
    }

    /// Merges `sourceIds` into `keeperId`: every food_entries/recipe_ingredients/
    /// supplement_ingredients row referencing a source is re-pointed to the
    /// keeper (servings rescaled so historical macros stay invariant), food
    /// labels are unioned onto the keeper, and the source food rows are
    /// permanently deleted. Fields the keeper is missing are auto-filled from
    /// the sources, and `overrides` wins over both. Returns the merged keeper
    /// (the full `Food` shape).
    func mergeFoods(
        keeperId: String,
        sourceIds: [String],
        overrides: [String: FoodMergeValue] = [:]
    ) async throws -> Food {
        let response: FoodResponse = try await post(
            "/api/foods/merge",
            body: FoodMergeRequest(
                keeperId: keeperId,
                sourceIds: sourceIds,
                overrides: overrides.isEmpty ? nil : overrides
            )
        )
        return response.food
    }
}
