import Foundation

extension BissbilanzAPI {
    // MARK: - Goals

    func getGoals() async throws -> Goals? {
        let response: GoalsResponse = try await get("/api/goals")
        return response.goals
    }

    func setGoals(
        _ goals: Goals,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> Goals {
        let response: GoalsResponse = try await post(
            "/api/goals", body: goals,
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.goals ?? goals
    }

    // MARK: - Preferences

    func getPreferences() async throws -> Preferences {
        // The server wraps the body as `{ preferences: {...} }` (like every other
        // endpoint), so decode the envelope rather than a bare `Preferences`.
        let response: PreferencesResponse = try await get("/api/preferences")
        return response.preferences
    }

    func updatePreferences(
        _ prefs: PreferencesUpdate,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> Preferences {
        let response: PreferencesResponse = try await patch(
            "/api/preferences", body: prefs,
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.preferences
    }

    // MARK: - Meal Types

    func getMealTypes() async throws -> [MealType] {
        let response: MealTypesResponse = try await get("/api/meal-types")
        return response.mealTypes
    }

    func createMealType(name: String, sortOrder: Int) async throws -> MealType {
        let response: MealTypeResponse = try await post(
            "/api/meal-types",
            body: MealTypeCreate(name: name, sortOrder: sortOrder)
        )
        return response.mealType
    }

    func deleteMealType(id: String) async throws {
        try await deleteRequest("/api/meal-types/\(id)")
    }
}
