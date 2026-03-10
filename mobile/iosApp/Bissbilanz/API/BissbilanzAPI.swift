import Foundation

enum APIError: Error, LocalizedError {
    case unauthorized
    case notFound
    case serverError(Int, String?)
    case networkError(Error)
    case decodingError(Error)

    var errorDescription: String? {
        switch self {
        case .unauthorized: return "Not authenticated"
        case .notFound: return "Not found"
        case .serverError(let code, let msg): return msg ?? "Server error (\(code))"
        case .networkError(let err): return err.localizedDescription
        case .decodingError(let err): return "Failed to parse response: \(err.localizedDescription)"
        }
    }
}

@MainActor
class BissbilanzAPI: ObservableObject {
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

    func getFavorites() async throws -> [Food] {
        let response: FavoritesResponse = try await get("/api/favorites")
        return response.foods
    }

    func getFood(id: String) async throws -> Food {
        let response: FoodResponse = try await get("/api/foods/\(id)")
        return response.food
    }

    func createFood(_ food: FoodCreate) async throws -> Food {
        let response: FoodResponse = try await post("/api/foods", body: food)
        return response.food
    }

    func deleteFood(id: String) async throws {
        try await delete("/api/foods/\(id)")
    }

    func findFoodByBarcode(_ barcode: String) async throws -> Food? {
        let response: FoodsResponse = try await get("/api/foods", params: ["barcode": barcode])
        return response.foods.first
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
        let response: EntryResponse = try await put("/api/entries/\(id)", body: update)
        return response.entry
    }

    func deleteEntry(id: String) async throws {
        try await delete("/api/entries/\(id)")
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

    func deleteRecipe(id: String) async throws {
        try await delete("/api/recipes/\(id)")
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

    func createWeightEntry(_ entry: WeightCreate) async throws -> WeightEntry {
        let response: WeightEntryResponse = try await post("/api/weight", body: entry)
        return response.entry
    }

    func deleteWeightEntry(id: String) async throws {
        try await delete("/api/weight/\(id)")
    }

    // MARK: - Supplements

    func getSupplements() async throws -> [Supplement] {
        let response: SupplementsResponse = try await get("/api/supplements")
        return response.supplements
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
        try await delete("/api/supplements/\(id)/log/\(date)")
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

    // MARK: - Preferences

    func getPreferences() async throws -> Preferences {
        try await get("/api/preferences")
    }

    func updatePreferences(_ prefs: PreferencesUpdate) async throws -> Preferences {
        try await put("/api/preferences", body: prefs)
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

    private func put<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        var request = URLRequest(url: URL(string: "\(baseURL)\(path)")!)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)
        return try await performRequest(request)
    }

    private func delete(_ path: String) async throws {
        var request = URLRequest(url: URL(string: "\(baseURL)\(path)")!)
        request.httpMethod = "DELETE"
        let _: EmptyResponse = try await performRequest(request)
    }

    private func performRequest<T: Decodable>(_ request: URLRequest) async throws -> T {
        var req = request
        if let token = authManager.accessToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await session.data(for: req)
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
