import Foundation
import Observation

enum APIError: Error, LocalizedError {
    case unauthorized
    case notFound
    /// HTTP 410 Gone — the resource existed and was permanently deleted.
    case gone
    case badRequest(String?)
    /// HTTP 409 with `X-Sync-Conflict: server-newer` — LWW conflict.
    case conflict(serverNewer: Bool)
    case serverError(Int, String?)
    case networkError(Error)
    /// The HTTP status and (truncated) body are carried alongside the underlying
    /// `DecodingError` so telemetry records the real response that failed to
    /// parse — an envelope/key/field mismatch otherwise surfaces as a bare
    /// decode error with no status or body.
    case decodingError(Error, statusCode: Int, body: String?)

    var errorDescription: String? {
        switch self {
        case .unauthorized: "Not authenticated"
        case .notFound: "Not found"
        case .gone: "Gone"
        case let .badRequest(msg): msg ?? "Bad request"
        case .conflict: "Conflict"
        case let .serverError(code, msg): msg ?? "Server error (\(code))"
        case let .networkError(err): err.localizedDescription
        case let .decodingError(err, _, _): "Failed to parse response: \(err.localizedDescription)"
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

    nonisolated static let defaultBaseURL = "https://bissbilanz.orellbuehler.ch"

    init(
        baseURL: String = BissbilanzAPI.defaultBaseURL,
        authManager: AuthManager,
        session: URLSession = .shared
    ) {
        self.baseURL = baseURL
        self.authManager = authManager
        self.session = session
        decoder = JSONDecoder()
        encoder = JSONEncoder()
    }

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
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws {
        try await deleteRequest(
            "/api/foods/\(id)",
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
    }

    func findFoodByBarcode(_ barcode: String) async throws -> Food? {
        let response: FoodsResponse = try await get("/api/foods", params: ["barcode": barcode])
        return response.foods.first
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

    // MARK: - Entries

    func getEntries(date: String) async throws -> [Entry] {
        let response: EntriesResponse = try await get("/api/entries", params: ["date": date])
        return response.entries
    }

    func getEntriesRange(startDate: String, endDate: String) async throws -> [Entry] {
        let response: EntriesResponse = try await get("/api/entries/range", params: [
            "startDate": startDate,
            "endDate": endDate,
        ])
        return response.entries
    }

    func createEntry(
        _ entry: EntryCreate,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> Entry {
        let response: EntryResponse = try await post(
            "/api/entries", body: entry,
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.entry
    }

    func updateEntry(
        id: String,
        _ update: EntryUpdate,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> Entry {
        let response: EntryResponse = try await patch(
            "/api/entries/\(id)", body: update,
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.entry
    }

    func deleteEntry(
        id: String,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws {
        try await deleteRequest(
            "/api/entries/\(id)",
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
    }

    func copyEntries(fromDate: String, toDate: String) async throws -> [Entry] {
        let response: EntriesResponse = try await post(
            "/api/entries/copy?fromDate=\(fromDate)&toDate=\(toDate)",
            body: [String: String]()
        )
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
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws {
        try await deleteRequest(
            "/api/recipes/\(id)",
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
    }

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

    // MARK: - Weight

    func getWeightEntries() async throws -> [WeightEntry] {
        let response: WeightEntriesResponse = try await get("/api/weight")
        return response.entries
    }

    func getLatestWeight() async throws -> WeightEntry? {
        let response: WeightEntryResponse? = try? await get("/api/weight/latest")
        return response?.entry
    }

    func createWeightEntry(
        _ entry: WeightCreate,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> WeightEntry {
        let response: WeightEntryResponse = try await post(
            "/api/weight", body: entry,
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.entry
    }

    func updateWeightEntry(
        id: String,
        _ update: WeightUpdate,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> WeightEntry {
        let response: WeightEntryResponse = try await patch(
            "/api/weight/\(id)", body: update,
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.entry
    }

    func deleteWeightEntry(
        id: String,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws {
        try await deleteRequest(
            "/api/weight/\(id)",
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
    }

    // MARK: - Sleep

    func getSleepEntries(from: String? = nil, to: String? = nil) async throws -> [SleepEntry] {
        var params: [String: String] = [:]
        if let from { params["from"] = from }
        if let to { params["to"] = to }
        let response: SleepEntriesResponse = try await get("/api/sleep", params: params)
        return response.entries
    }

    func createSleepEntry(
        _ entry: SleepCreate,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> SleepEntry {
        let response: SleepEntryResponse = try await post(
            "/api/sleep", body: entry,
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.entry
    }

    func updateSleepEntry(
        id: String,
        _ update: SleepUpdate,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> SleepEntry {
        let response: SleepEntryResponse = try await patch(
            "/api/sleep/\(id)", body: update,
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.entry
    }

    func deleteSleepEntry(
        id: String,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws {
        try await deleteRequest(
            "/api/sleep/\(id)",
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
    }

    // MARK: - Supplements

    /// `all: true` also returns archived supplements — the default list is
    /// active-only, which silently loses rows in a full account download.
    func getSupplements(all: Bool = false) async throws -> [Supplement] {
        let response: SupplementsResponse = try await get(
            "/api/supplements",
            params: all ? ["all": "true"] : [:]
        )
        return response.supplements
    }

    func createSupplement(
        _ supplement: SupplementCreate,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> Supplement {
        let response: SupplementResponse = try await post(
            "/api/supplements", body: supplement,
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.supplement
    }

    func updateSupplement(
        id: String,
        _ update: SupplementUpdate,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> Supplement {
        let response: SupplementResponse = try await patch(
            "/api/supplements/\(id)", body: update,
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.supplement
    }

    func deleteSupplement(
        id: String,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws {
        try await deleteRequest(
            "/api/supplements/\(id)",
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
    }

    func getSupplementChecklist(date: String) async throws -> [SupplementChecklist] {
        let response: SupplementChecklistResponse = try await get("/api/supplements/\(date)/checklist")
        return response.checklist
    }

    func logSupplement(
        id: String,
        date: String,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> SupplementLog {
        let response: SupplementLogResponse = try await post(
            "/api/supplements/\(id)/log", body: ["date": date],
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.log
    }

    func unlogSupplement(
        id: String,
        date: String,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws {
        try await deleteRequest(
            "/api/supplements/\(id)/log/\(date)",
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
    }

    func getSupplementHistory(startDate: String, endDate: String) async throws -> [SupplementHistoryEntry] {
        let response: SupplementHistoryResponse = try await get("/api/supplements/history", params: [
            "from": startDate,
            "to": endDate,
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

    func getCalendarStats(month: Int, year: Int) async throws -> [String: CalendarDayData] {
        let response: CalendarResponse = try await get("/api/stats/calendar", params: [
            "month": String(format: "%04d-%02d", year, month),
        ])
        return response.days
    }

    func getMealBreakdown(days: Int = 7) async throws -> [MealBreakdownEntry] {
        let end = Date()
        let start = end.adding(days: -(days - 1))
        let response: MealBreakdownResponse = try await get("/api/stats/meal-breakdown", params: [
            "startDate": DateFormatting.isoString(from: start),
            "endDate": DateFormatting.isoString(from: end),
        ])
        return response.data
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

    // MARK: - Day Properties

    // The server exposes day properties as a single collection route keyed by a
    // `date` query parameter (GET/DELETE) and a PUT body — there is no `/{date}`
    // path segment and no POST handler.
    func getDayProperties(date: String) async throws -> DayProperties? {
        let response: DayPropertiesResponse = try await get("/api/day-properties", params: ["date": date])
        return response.properties
    }

    func getDayPropertiesRange(startDate: String, endDate: String) async throws -> [DayProperties] {
        let response: DayPropertiesRangeResponse = try await get("/api/day-properties", params: [
            "startDate": startDate,
            "endDate": endDate,
        ])
        return response.data
    }

    func setDayProperties(
        date: String,
        isFastingDay: Bool,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> DayProperties {
        let body = DayPropertiesSet(date: date, isFastingDay: isFastingDay)
        let response: DayPropertiesResponse = try await put(
            "/api/day-properties", body: body,
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        guard let properties = response.properties else {
            throw APIError.serverError(200, "Server returned null properties for day \(date)")
        }
        return properties
    }

    func deleteDayProperties(
        date: String,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws {
        try await deleteRequest(
            "/api/day-properties?date=\(date)",
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
    }

    // MARK: - Open Food Facts proxy

    /// The proxy returns `{product: {...}}` — the `Food` prefill shape minus
    /// the user-scoped fields (`userId`, `isFavorite`) and with nullable
    /// serving info, so the gaps are patched in before decoding, mirroring
    /// the Local-mode `OpenFoodFactsClient`. Returns nil for unknown barcodes
    /// or unparseable responses.
    func lookupBarcode(_ barcode: String) async throws -> Food? {
        // The barcode is untrusted external input: the scanner accepts Code 39
        // (whose charset includes the space) and Code 128 (full ASCII), so a
        // scan can legitimately produce a string that isn't a valid path
        // segment. Percent-encode against alphanumerics — anything a product
        // code actually contains survives, everything else is escaped rather
        // than reshaping the URL.
        guard let encoded = barcode.addingPercentEncoding(withAllowedCharacters: .alphanumerics),
              let url = URL(string: "\(baseURL)/api/openfoodfacts/\(encoded)")
        else { return nil }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.cachePolicy = .reloadIgnoringLocalCacheData
        guard let (data, httpResponse) = try? await executeRequestData(request),
              httpResponse.statusCode == 200,
              let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              var product = root["product"] as? [String: Any]
        else { return nil }

        product["userId"] = ""
        product["isFavorite"] = false
        if !(product["servingSize"] is NSNumber) {
            product["servingSize"] = 100
        }
        let unit = product["servingUnit"] as? String
        if ServingUnit(rawValue: unit ?? "") == nil {
            product["servingUnit"] = "g"
        }
        if !(product["barcode"] is String) {
            product["barcode"] = barcode
        }
        return try? JSONPatch.decode(Food.self, from: product)
    }

    // MARK: - AI Tasks

    /// Resolves a server-relative upload path (`/uploads/...`) against the API host.
    /// The photo endpoint is session-authenticated, so `AsyncImage` can load it directly.
    nonisolated static func absoluteURL(for path: String) -> URL? {
        guard path.hasPrefix("/") else { return URL(string: path) }
        return URL(string: "\(defaultBaseURL)\(path)")
    }


    func createAiTask(_ task: AiTaskCreate, idempotencyKey: String? = nil) async throws -> AiTask {
        let response: AiTaskResponse = try await post(
            "/api/ai-tasks", body: task, idempotencyKey: idempotencyKey
        )
        return response.task
    }

    func listAiTasks(
        status: String? = nil,
        acknowledged: Bool? = nil,
        limit: Int? = nil,
        offset: Int? = nil
    ) async throws -> (tasks: [AiTask], total: Int) {
        var params: [String: String] = [:]
        if let status { params["status"] = status }
        if let acknowledged { params["acknowledged"] = acknowledged ? "true" : "false" }
        if let limit { params["limit"] = "\(limit)" }
        if let offset { params["offset"] = "\(offset)" }
        let response: AiTasksResponse = try await get("/api/ai-tasks", params: params)
        return (response.tasks, response.total)
    }

    func updateAiTask(
        id: String,
        _ update: AiTaskUpdate,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> AiTask {
        let response: AiTaskResponse = try await patch(
            "/api/ai-tasks/\(id)", body: update,
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.task
    }

    func deleteAiTask(
        id: String,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws {
        try await deleteRequest(
            "/api/ai-tasks/\(id)",
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
    }

    /// Clears the unread state on resolved tasks. Pass nil to acknowledge everything
    /// unacknowledged, which is what opening the list does.
    @discardableResult
    func acknowledgeAiTasks(ids: [String]? = nil) async throws -> Int {
        let response: AiTaskAcknowledgeResponse = try await post(
            "/api/ai-tasks/acknowledge", body: AiTaskAcknowledge(ids: ids)
        )
        return response.acknowledged
    }

    /// Uploads every photo of one meal in a single request — the route reads
    /// repeated `photo` parts and answers with the URLs in the order sent.
    func uploadAiTaskPhotos(_ photos: [(data: Data, filename: String)]) async throws -> [String] {
        let response: AiTaskPhotoResponse = try await postMultipart(
            "/api/ai-tasks/photo", fieldName: "photo", parts: photos
        )
        return response.photoUrls
    }

    // MARK: - Images

    /// Uploads a food or recipe image and returns its `/uploads/<uuid>.webp` URL.
    /// The route reads the `image` form field; `postMultipart` sets the `Origin`
    /// header the server's CSRF check requires of any native multipart POST.
    func uploadImage(_ data: Data, filename: String = "food.jpg") async throws -> String {
        let response: ImageUploadResponse = try await postMultipart(
            "/api/images/upload", data: data, fieldName: "image", filename: filename
        )
        return response.imageUrl
    }

    /// Attaches or, with a nil `imageUrl`, removes a food's image.
    ///
    /// A partial PATCH rather than a full `FoodCreate` body: that struct's
    /// optional fields are omitted when nil, so a removal sent that way would
    /// never reach the server and the old image would stay.
    func setFoodImage(
        id: String,
        imageUrl: String?,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> Food {
        let response: FoodResponse = try await patch(
            "/api/foods/\(id)", body: ImagePatch(imageUrl: imageUrl),
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.food
    }

    /// Whether a URL points at our own API. Used to keep the account's bearer
    /// token off every other host — scheme, host and port must all match, since
    /// a plaintext or different-port variant of the same name is a different
    /// origin.
    func isOwnHost(_ url: URL) -> Bool {
        guard let base = URL(string: baseURL) else { return false }
        return url.scheme == base.scheme && url.host() == base.host() && url.port == base.port
    }

    /// Raw bytes of a server-hosted image. Takes a server-relative path only, so
    /// the account's bearer token cannot be sent anywhere but our own host.
    func downloadImage(path: String) async throws -> Data {
        guard path.hasPrefix("/") else { throw APIError.badRequest("Not a server path") }
        let request = URLRequest(url: URL(string: "\(baseURL)\(path)")!)
        let (data, httpResponse) = try await executeRequestData(request)
        if httpResponse.statusCode >= 400 {
            throw APIError.serverError(httpResponse.statusCode, nil)
        }
        return data
    }

    // MARK: - HTTP helpers

    private func get<T: Decodable>(_ path: String, params: [String: String] = [:]) async throws -> T {
        var components = URLComponents(string: "\(baseURL)\(path)")!
        if !params.isEmpty {
            components.queryItems = params.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        var request = URLRequest(url: components.url!)
        request.httpMethod = "GET"
        // Never serve API reads from URLCache: these are per-user, frequently
        // mutated rows (an entry logged on web/MCP must show on the next pull),
        // and a stale 200 would silently hide fresh data with no error to debug.
        request.cachePolicy = .reloadIgnoringLocalCacheData
        return try await performRequest(request)
    }

    private func post<T: Decodable>(
        _ path: String,
        body: some Encodable,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> T {
        var request = URLRequest(url: URL(string: "\(baseURL)\(path)")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)
        applySyncHeaders(&request, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)
        return try await performRequest(request)
    }

    private func patch<T: Decodable>(
        _ path: String,
        body: some Encodable,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> T {
        var request = URLRequest(url: URL(string: "\(baseURL)\(path)")!)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)
        applySyncHeaders(&request, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)
        return try await performRequest(request)
    }

    private func put<T: Decodable>(
        _ path: String,
        body: some Encodable,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> T {
        var request = URLRequest(url: URL(string: "\(baseURL)\(path)")!)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)
        applySyncHeaders(&request, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)
        return try await performRequest(request)
    }

    /// The server's manual CSRF check (`isOriginMismatch` in `hooks.server.ts`)
    /// blocks any `multipart/form-data` POST that arrives without an `Origin`
    /// header — browsers always send one, but `URLSession` doesn't, so it must
    /// be set explicitly here or every multipart upload 403s.
    private func postMultipart<T: Decodable>(
        _ path: String,
        data: Data,
        fieldName: String,
        filename: String,
        mimeType: String = "image/jpeg"
    ) async throws -> T {
        try await postMultipart(
            path, fieldName: fieldName, parts: [(data: data, filename: filename)], mimeType: mimeType
        )
    }

    /// Repeats `fieldName` once per part, which is how the routes that accept
    /// several files read them.
    private func postMultipart<T: Decodable>(
        _ path: String,
        fieldName: String,
        parts: [(data: Data, filename: String)],
        mimeType: String = "image/jpeg"
    ) async throws -> T {
        var request = URLRequest(url: URL(string: "\(baseURL)\(path)")!)
        request.httpMethod = "POST"
        let boundary = "Boundary-\(UUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.setValue(baseURL, forHTTPHeaderField: "Origin")
        request.httpBody = Self.multipartBody(
            boundary: boundary, fieldName: fieldName, mimeType: mimeType, parts: parts
        )
        return try await performRequest(request)
    }

    private static func multipartBody(
        boundary: String,
        fieldName: String,
        mimeType: String,
        parts: [(data: Data, filename: String)]
    ) -> Data {
        var body = Data()
        for part in parts {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append(
                "Content-Disposition: form-data; name=\"\(fieldName)\"; filename=\"\(part.filename)\"\r\n"
                    .data(using: .utf8)!
            )
            body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
            body.append(part.data)
            body.append("\r\n".data(using: .utf8)!)
        }
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        return body
    }

    func getAccount() async throws -> AccountResponse {
        try await get("/api/account")
    }

    func deleteAccount() async throws {
        try await deleteRequest("/api/account")
    }

    /// Downloads the full-account ZIP archive. Returns the raw bytes — the
    /// response is a binary archive, not the JSON envelope `performRequest`
    /// expects.
    func exportAccountData() async throws -> Data {
        var request = URLRequest(url: URL(string: "\(baseURL)/api/account/export")!)
        // Full-account archive incl. photos — allow more than the default 60s
        request.timeoutInterval = 120
        ErrorReporter.addBreadcrumb("GET /api/account/export", category: "http")
        do {
            let (data, httpResponse) = try await executeRequestData(request)
            if httpResponse.statusCode >= 400 {
                throw APIError.serverError(httpResponse.statusCode, String(data: data, encoding: .utf8))
            }
            return data
        } catch {
            ErrorReporter.capture(error, context: Self.errorContext(for: request, error: error))
            throw error
        }
    }

    private func deleteRequest(
        _ path: String,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws {
        var request = URLRequest(url: URL(string: "\(baseURL)\(path)")!)
        request.httpMethod = "DELETE"
        applySyncHeaders(&request, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)
        let _: EmptyResponse = try await performRequest(request)
    }

    private func applySyncHeaders(
        _ request: inout URLRequest,
        idempotencyKey: String?,
        clientEditedAt: String?
    ) {
        if let key = idempotencyKey {
            request.setValue(key, forHTTPHeaderField: "Idempotency-Key")
        }
        if let editedAt = clientEditedAt {
            request.setValue(editedAt, forHTTPHeaderField: "X-Client-Edited-At")
        }
    }

    /// Single funnel for every API call: report failures to Sentry here so
    /// callers that recover (cache fallback, sync retries, `try?` lookups)
    /// don't silently swallow real defects. `ErrorReporter` filters expected
    /// noise (unauthorized, offline, not-found).
    ///
    /// Every request also drops a breadcrumb and, on failure, attaches the
    /// endpoint, method, status code and (truncated) response body — enough to
    /// debug a reported issue without reproducing it.
    private func performRequest<T: Decodable>(_ request: URLRequest) async throws -> T {
        ErrorReporter.addBreadcrumb(
            "\(request.httpMethod ?? "?") \(request.url?.path ?? "?")",
            category: "http"
        )
        do {
            return try await executeRequest(request)
        } catch {
            ErrorReporter.capture(error, context: Self.errorContext(for: request, error: error))
            throw error
        }
    }

    /// Builds the structured context attached to a captured API error. Only the
    /// URL *path* is included — query strings can carry search terms (food
    /// names), and the response body is truncated to keep events small and
    /// avoid shipping large payloads.
    private static func errorContext(for request: URLRequest, error: Error) -> [String: Any] {
        var context: [String: Any] = [:]
        if let method = request.httpMethod {
            context["method"] = method
        }
        if let path = request.url?.path {
            context["endpoint"] = path
        }
        switch error as? APIError {
        case let .serverError(code, message):
            context["status_code"] = code
            if let message {
                context["response_body"] = String(message.prefix(500))
            }
        case let .badRequest(message):
            context["status_code"] = 400
            if let message {
                context["response_body"] = String(message.prefix(500))
            }
        case let .decodingError(underlying, statusCode, body):
            context["status_code"] = statusCode
            context["decoding_error"] = String(describing: underlying)
            if let body {
                context["response_body"] = String(body.prefix(500))
            }
        case .networkError, .notFound, .gone, .conflict, .unauthorized, .none:
            break
        }
        return context
    }

    private func executeRequest<T: Decodable>(_ request: URLRequest) async throws -> T {
        // Both the first attempt and the post-refresh 401 retry come back
        // through the same status classification + decode, so a 4xx/5xx/decode
        // failure on retry surfaces as the right APIError rather than a raw
        // DecodingError.
        let (data, httpResponse) = try await executeRequestData(request)
        return try decodeResponse(data, httpResponse)
    }

    private func executeRequestData(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        // Refresh a token already past its `exp` before spending a request on
        // it. The 401 path below still exists for everything this can't know
        // (a revoked token, a clock skew, an unparseable JWT) — this just stops
        // the predictable case from costing a full round trip every time.
        if authManager.isAccessTokenExpired {
            _ = await authManager.refreshAccessToken()
        }
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
                // Wrapped like the first attempt above — an unwrapped
                // `session.data` here let a raw URLError escape past the
                // APIError taxonomy, so every `catch let error as APIError`
                // missed it and ErrorReporter classified it down a different
                // branch than the identical failure on the first attempt.
                let retryData: Data
                let retryResponse: URLResponse
                do {
                    (retryData, retryResponse) = try await session.data(for: retryReq)
                } catch {
                    throw APIError.networkError(error)
                }
                guard let retryHTTP = retryResponse as? HTTPURLResponse else {
                    throw APIError.networkError(URLError(.badServerResponse))
                }
                if retryHTTP.statusCode == 401 {
                    throw APIError.unauthorized
                }
                return (retryData, retryHTTP)
            }
            // `unauthorized` means "session is dead, prompt to sign in" — a
            // transient refresh failure (offline, 5xx) is just retryable.
            switch authManager.authState {
            case .expired, .unauthenticated:
                throw APIError.unauthorized
            case .authenticated, .refreshing:
                throw APIError.networkError(URLError(.cannotConnectToHost))
            }
        }

        return (data, httpResponse)
    }

    /// Classifies a response's status code into the right `APIError`
    /// (conflict / notFound / gone / badRequest / serverError) and otherwise
    /// decodes the body, wrapping decode failures as `.decodingError`. Shared by
    /// the first attempt and the post-refresh 401 retry so both paths handle
    /// errors identically.
    private func decodeResponse<T: Decodable>(_ data: Data, _ httpResponse: HTTPURLResponse) throws -> T {
        if httpResponse.statusCode == 409 {
            let conflictHeader = httpResponse.value(forHTTPHeaderField: "X-Sync-Conflict")
            throw APIError.conflict(serverNewer: conflictHeader == "server-newer")
        }
        if httpResponse.statusCode == 404 {
            throw APIError.notFound
        }
        if httpResponse.statusCode == 410 {
            throw APIError.gone
        }
        if httpResponse.statusCode == 400 {
            throw APIError.badRequest(String(data: data, encoding: .utf8))
        }
        if httpResponse.statusCode >= 400 {
            throw APIError.serverError(httpResponse.statusCode, String(data: data, encoding: .utf8))
        }
        // A 204 No Content (every DELETE) or any empty 2xx body carries nothing
        // to decode. `deleteRequest` asks for `EmptyResponse` here; returning the
        // sentinel avoids the dataCorrupted ("Unexpected end of file") error that
        // would otherwise dead-letter every queued delete after maxRetries. Real
        // typed responses still throw on an empty body — the `as? T` cast only
        // succeeds for the body-less EmptyResponse.
        if httpResponse.statusCode == 204 || data.isEmpty {
            if let empty = EmptyResponse() as? T {
                return empty
            }
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(
                error,
                statusCode: httpResponse.statusCode,
                body: String(data: data, encoding: .utf8)
            )
        }
    }
}

private struct EmptyResponse: Decodable {}
