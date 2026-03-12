import Foundation
import Observation

enum APIError: Error, LocalizedError {
    case unauthorized
    case notFound
    case badRequest(String?)
    case serverError(Int, String?)
    case networkError(Error)
    case decodingError(Error)

    var errorDescription: String? {
        switch self {
        case .unauthorized: return "Not authenticated"
        case .notFound: return "Not found"
        case .badRequest(let msg): return msg ?? "Bad request"
        case .serverError(let code, let msg): return msg ?? "Server error (\(code))"
        case .networkError(let err): return err.localizedDescription
        case .decodingError(let err): return "Failed to parse response: \(err.localizedDescription)"
        }
    }
}

@MainActor
@Observable
final class BissbilanzAPI {
    private let baseURL: String
    private let authManager: AuthManager
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    init(baseURL: String = "https://bissbilanz.orell.ch", authManager: AuthManager) {
        self.baseURL = baseURL
        self.authManager = authManager
        self.session = URLSession.shared
        self.decoder = JSONDecoder()
        self.encoder = JSONEncoder()
    }

    // MARK: - Foods

    func searchFoods(query: String) async throws -> [Food] {
        let response: FoodsResponse = try await get("/api/foods", params: ["search": query])
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

    func createFood(_ food: FoodCreate) async throws -> Food {
        let response: FoodResponse = try await post("/api/foods", body: food)
        return response.food
    }

    func updateFood(id: String, _ food: FoodCreate) async throws -> Food {
        let response: FoodResponse = try await patch("/api/foods/\(id)", body: food)
        return response.food
    }

    func deleteFood(id: String) async throws {
        try await deleteRequest("/api/foods/\(id)")
    }

    func findFoodByBarcode(_ barcode: String) async throws -> Food? {
        let response: FoodsResponse = try await get("/api/foods", params: ["barcode": barcode])
        return response.foods.first
    }

    func toggleFavorite(foodId: String, isFavorite: Bool) async throws -> Food {
        let body = ["isFavorite": isFavorite]
        let response: FoodResponse = try await patch("/api/foods/\(foodId)", body: body)
        return response.food
    }

    // MARK: - Entries

    func getEntries(date: String) async throws -> [Entry] {
        let response: EntriesResponse = try await get("/api/entries", params: ["date": date])
        return response.entries
    }

    func createEntry(_ entry: EntryCreate) async throws -> Entry {
        let response: EntryResponse = try await post("/api/entries", body: entry)
        return response.entry
    }

    func updateEntry(id: String, _ update: EntryUpdate) async throws -> Entry {
        let response: EntryResponse = try await patch("/api/entries/\(id)", body: update)
        return response.entry
    }

    func deleteEntry(id: String) async throws {
        try await deleteRequest("/api/entries/\(id)")
    }

    func copyEntries(fromDate: String, toDate: String) async throws -> [Entry] {
        let body = ["fromDate": fromDate, "toDate": toDate]
        let response: EntriesResponse = try await post("/api/entries/copy", body: body)
        return response.entries
    }

    // MARK: - Recipes

    func getRecipes() async throws -> [Recipe] {
        let response: RecipesResponse = try await get("/api/recipes")
        return response.recipes
    }

    func getRecipe(id: String) async throws -> Recipe {
        let response: RecipeResponse = try await get("/api/recipes/\(id)")
        return response.recipe
    }

    func createRecipe(_ recipe: RecipeCreate) async throws -> Recipe {
        let response: RecipeResponse = try await post("/api/recipes", body: recipe)
        return response.recipe
    }

    func updateRecipe(id: String, _ update: RecipeUpdate) async throws -> Recipe {
        let response: RecipeResponse = try await patch("/api/recipes/\(id)", body: update)
        return response.recipe
    }

    func deleteRecipe(id: String) async throws {
        try await deleteRequest("/api/recipes/\(id)")
    }

    // MARK: - Goals

    func getGoals() async throws -> Goals? {
        let response: GoalsResponse = try await get("/api/goals")
        return response.goals
    }

    func setGoals(_ goals: Goals) async throws -> Goals {
        let response: GoalsResponse = try await post("/api/goals", body: goals)
        return response.goals ?? goals
    }

    // MARK: - Weight

    func getWeightEntries() async throws -> [WeightEntry] {
        let response: WeightEntriesResponse = try await get("/api/weight")
        return response.entries
    }

    func getLatestWeight() async throws -> WeightEntry? {
        let response: WeightEntryResponse? = try? await get("/api/weight/latest")
        return response?.entry
    }

    func createWeightEntry(_ entry: WeightCreate) async throws -> WeightEntry {
        let response: WeightEntryResponse = try await post("/api/weight", body: entry)
        return response.entry
    }

    func updateWeightEntry(id: String, _ update: WeightUpdate) async throws -> WeightEntry {
        let response: WeightEntryResponse = try await patch("/api/weight/\(id)", body: update)
        return response.entry
    }

    func deleteWeightEntry(id: String) async throws {
        try await deleteRequest("/api/weight/\(id)")
    }

    // MARK: - Supplements

    func getSupplements() async throws -> [Supplement] {
        let response: SupplementsResponse = try await get("/api/supplements")
        return response.supplements
    }

    func createSupplement(_ supplement: SupplementCreate) async throws -> Supplement {
        let response: SupplementResponse = try await post("/api/supplements", body: supplement)
        return response.supplement
    }

    func updateSupplement(id: String, _ update: SupplementUpdate) async throws -> Supplement {
        let response: SupplementResponse = try await patch("/api/supplements/\(id)", body: update)
        return response.supplement
    }

    func deleteSupplement(id: String) async throws {
        try await deleteRequest("/api/supplements/\(id)")
    }

    func getSupplementChecklist(date: String) async throws -> [SupplementChecklist] {
        let response: SupplementChecklistResponse = try await get("/api/supplements/\(date)/checklist")
        return response.checklist
    }

    func logSupplement(id: String, date: String) async throws -> SupplementLog {
        let response: SupplementLogResponse = try await post("/api/supplements/\(id)/log", body: ["date": date])
        return response.log
    }

    func unlogSupplement(id: String, date: String) async throws {
        try await deleteRequest("/api/supplements/\(id)/log/\(date)")
    }

    func getSupplementHistory(startDate: String, endDate: String) async throws -> [SupplementHistoryEntry] {
        let response: SupplementHistoryResponse = try await get("/api/supplements/history", params: [
            "startDate": startDate,
            "endDate": endDate,
        ])
        return response.history
    }

    // MARK: - Stats

    func getWeeklyStats() async throws -> MacroTotals {
        let response: WeeklyMonthlyStatsResponse = try await get("/api/stats/weekly")
        return response.stats
    }

    func getMonthlyStats() async throws -> MacroTotals {
        let response: WeeklyMonthlyStatsResponse = try await get("/api/stats/monthly")
        return response.stats
    }

    func getStreaks() async throws -> StreaksResponse {
        try await get("/api/stats/streaks")
    }

    func getTopFoods(days: Int = 7, limit: Int = 10) async throws -> [TopFoodEntry] {
        let response: TopFoodsResponse = try await get("/api/stats/top-foods", params: [
            "days": "\(days)",
            "limit": "\(limit)",
        ])
        return response.data
    }

    func getDailyStats(startDate: String, endDate: String) async throws -> DailyStatsResponse {
        try await get("/api/stats/daily", params: [
            "startDate": startDate,
            "endDate": endDate,
        ])
    }

    func getCalendarStats(month: Int, year: Int) async throws -> [CalendarDay] {
        let response: CalendarResponse = try await get("/api/stats/calendar", params: [
            "month": "\(month)",
            "year": "\(year)",
        ])
        return response.data
    }

    func getMealBreakdown(days: Int = 7) async throws -> [MealBreakdownEntry] {
        let response: MealBreakdownResponse = try await get("/api/stats/meal-breakdown", params: [
            "days": "\(days)",
        ])
        return response.data
    }

    // MARK: - Maintenance

    func calculateMaintenance(_ request: MaintenanceRequest) async throws -> MaintenanceResponse {
        try await post("/api/maintenance", body: request)
    }

    // MARK: - Preferences

    func getPreferences() async throws -> Preferences {
        try await get("/api/preferences")
    }

    func updatePreferences(_ prefs: PreferencesUpdate) async throws -> Preferences {
        try await patch("/api/preferences", body: prefs)
    }

    // MARK: - Meal Types

    func getMealTypes() async throws -> [MealType] {
        let response: MealTypesResponse = try await get("/api/meal-types")
        return response.mealTypes
    }

    func createMealType(name: String) async throws -> MealType {
        let response: MealTypeResponse = try await post("/api/meal-types", body: MealTypeCreate(name: name))
        return response.mealType
    }

    func deleteMealType(id: String) async throws {
        try await deleteRequest("/api/meal-types/\(id)")
    }

    // MARK: - Open Food Facts proxy

    func lookupBarcode(_ barcode: String) async throws -> Food? {
        let response: FoodResponse? = try? await get("/api/openfoodfacts/\(barcode)")
        return response?.food
    }

    // MARK: - HTTP helpers

    private func get<T: Decodable>(_ path: String, params: [String: String] = [:]) async throws -> T {
        var components = URLComponents(string: "\(baseURL)\(path)")!
        if !params.isEmpty {
            components.queryItems = params.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        var request = URLRequest(url: components.url!)
        request.httpMethod = "GET"
        return try await performRequest(request)
    }

    private func post<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        var request = URLRequest(url: URL(string: "\(baseURL)\(path)")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)
        return try await performRequest(request)
    }

    private func patch<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        var request = URLRequest(url: URL(string: "\(baseURL)\(path)")!)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)
        return try await performRequest(request)
    }

    private func deleteRequest(_ path: String) async throws {
        var request = URLRequest(url: URL(string: "\(baseURL)\(path)")!)
        request.httpMethod = "DELETE"
        let _: EmptyResponse = try await performRequest(request)
    }

    private func performRequest<T: Decodable>(_ request: URLRequest) async throws -> T {
        var req = request
        if let token = authManager.accessToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw APIError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.networkError(URLError(.badServerResponse))
        }

        if httpResponse.statusCode == 401 {
            if await authManager.refreshAccessToken() {
                var retryReq = request
                if let token = authManager.accessToken {
                    retryReq.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                }
                let (retryData, retryResponse) = try await session.data(for: retryReq)
                guard let retryHTTP = retryResponse as? HTTPURLResponse else {
                    throw APIError.networkError(URLError(.badServerResponse))
                }
                if retryHTTP.statusCode == 401 {
                    throw APIError.unauthorized
                }
                return try decoder.decode(T.self, from: retryData)
            }
            throw APIError.unauthorized
        }

        if httpResponse.statusCode == 404 {
            throw APIError.notFound
        }

        if httpResponse.statusCode == 400 {
            let errorMsg = String(data: data, encoding: .utf8)
            throw APIError.badRequest(errorMsg)
        }

        if httpResponse.statusCode >= 400 {
            let errorMsg = String(data: data, encoding: .utf8)
            throw APIError.serverError(httpResponse.statusCode, errorMsg)
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }
}

private struct EmptyResponse: Decodable {}
