@testable import Bissbilanz
import Foundation
import SwiftData
import Testing

// MARK: - Networking stub

/// Routes stubbed responses by "METHOD path". Unstubbed requests get a 404 so
/// repository API calls fail loudly instead of hanging.
final class StubURLProtocol: URLProtocol {
    struct Stub {
        let status: Int
        let body: Data
    }

    private nonisolated(unsafe) static var stubs: [String: Stub] = [:]
    private nonisolated(unsafe) static var recorded: [String] = []
    private static let lock = NSLock()

    static func reset() {
        lock.lock()
        defer { lock.unlock() }
        stubs = [:]
        recorded = []
    }

    static func stub(_ method: String, _ path: String, status: Int = 200, json: String = "{}") {
        lock.lock()
        defer { lock.unlock() }
        stubs["\(method) \(path)"] = Stub(status: status, body: Data(json.utf8))
    }

    static var recordedRequests: [String] {
        lock.lock()
        defer { lock.unlock() }
        return recorded
    }

    override class func canInit(with _: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        let key = "\(request.httpMethod ?? "GET") \(request.url?.path ?? "")"
        Self.lock.lock()
        Self.recorded.append(key)
        let stub = Self.stubs[key]
        Self.lock.unlock()

        let response = HTTPURLResponse(
            url: request.url ?? URL(string: "https://stub.local")!,
            statusCode: stub?.status ?? 404,
            httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: stub?.body ?? Data("{}".utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

// MARK: - Test harness

@MainActor
struct RepositoryHarness {
    let container: ModelContainer
    let context: ModelContext
    let api: BissbilanzAPI

    init() throws {
        StubURLProtocol.reset()
        container = try LocalStore.makeContainer(inMemory: true)
        context = container.mainContext
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        api = BissbilanzAPI(
            baseURL: "https://stub.local",
            authManager: AuthManager(baseURL: "https://stub.local"),
            session: URLSession(configuration: configuration)
        )
    }

    func entry(id: String, date: String, mealType: String = "lunch", foodId: String? = nil) throws -> Entry {
        var dict: [String: Any] = [
            "id": id,
            "mealType": mealType,
            "servings": 1,
            "foodName": "Seed \(id)",
            "calories": 100,
            "date": date,
        ]
        if let foodId { dict["foodId"] = foodId }
        return try JSONPatch.decode(Entry.self, from: dict)
    }

    func food(id: String, name: String, isFavorite: Bool = false, barcode: String? = nil) throws -> Food {
        var dict: [String: Any] = [
            "id": id,
            "userId": "u1",
            "name": name,
            "servingSize": 100,
            "servingUnit": "g",
            "calories": 100,
            "protein": 10,
            "carbs": 20,
            "fat": 5,
            "fiber": 3,
            "isFavorite": isFavorite,
        ]
        if let barcode { dict["barcode"] = barcode }
        return try JSONPatch.decode(Food.self, from: dict)
    }

    func recipe(id: String, name: String, isFavorite: Bool = false) throws -> Recipe {
        try JSONPatch.decode(Recipe.self, from: [
            "id": id,
            "userId": "u1",
            "name": name,
            "totalServings": 2,
            "isFavorite": isFavorite,
        ])
    }

    func weight(id: String, date: String, kg: Double) throws -> WeightEntry {
        try JSONPatch.decode(WeightEntry.self, from: [
            "id": id,
            "userId": "u1",
            "weightKg": kg,
            "entryDate": date,
        ])
    }

    func supplement(id: String, name: String, sortOrder: Int = 0) throws -> Supplement {
        try JSONPatch.decode(Supplement.self, from: [
            "id": id,
            "userId": "u1",
            "name": name,
            "scheduleType": "daily",
            "isActive": true,
            "sortOrder": sortOrder,
            "ingredients": [],
        ])
    }
}

// MARK: - Tests

@Suite("Repository tests", .serialized)
@MainActor
struct RepositoryTests {
    // MARK: Entries

    @Test("Entry refresh replaces the cached day, leaving other days untouched")
    func entryRefreshReplacesByDate() async throws {
        let harness = try RepositoryHarness()
        let repo = EntryRepository(context: harness.context, api: harness.api)
        try harness.context.insert(LocalEntry(
            entry: harness.entry(id: "old-1", date: "2026-06-01"),
            date: "2026-06-01"
        ))
        try harness.context.insert(LocalEntry(
            entry: harness.entry(id: "other-1", date: "2026-06-02"),
            date: "2026-06-02"
        ))
        try harness.context.save()

        StubURLProtocol.stub("GET", "/api/entries", json: """
        {"entries": [{
            "id": "new-1", "mealType": "breakfast", "servings": 2,
            "foodId": "f1", "foodName": "Oats",
            "calories": 150, "protein": 5, "carbs": 27, "fat": 2.5, "fiber": 4
        }]}
        """)

        try await repo.refresh(date: "2026-06-01")

        let day = repo.entries(date: "2026-06-01")
        #expect(day.count == 1)
        #expect(day.first?.id == "new-1")
        #expect(day.first?.date == "2026-06-01")
        #expect(repo.entries(date: "2026-06-02").map(\.id) == ["other-1"])
    }

    @Test("Entry create writes locally first, then replaces the temp row with the server record")
    func entryCreateReplacesTempWithServerRecord() async throws {
        let harness = try RepositoryHarness()
        let repo = EntryRepository(context: harness.context, api: harness.api)
        StubURLProtocol.stub("POST", "/api/entries", json: """
        {"entry": {
            "id": "server-1", "userId": "u1", "date": "2026-06-01",
            "mealType": "lunch", "servings": 1.5, "foodId": "f1"
        }}
        """)

        let create = EntryCreate(foodId: "f1", mealType: "lunch", servings: 1.5, date: "2026-06-01")
        let created = try await repo.createEntry(create, food: harness.food(id: "f1", name: "Rice"))

        #expect(created.id == "server-1")
        let day = repo.entries(date: "2026-06-01")
        #expect(day.count == 1)
        #expect(day.first?.id == "server-1")
        // Raw POST responses lack resolved macros — merged from the optimistic row.
        #expect(day.first?.displayName == "Rice")
        #expect(day.first?.totalCalories == 150)
        #expect(!day.contains { LocalStore.isTempId($0.id) })
    }

    @Test("Entry create keeps the optimistic local row when the API fails")
    func entryCreateKeepsLocalRowOnAPIFailure() async throws {
        let harness = try RepositoryHarness()
        let repo = EntryRepository(context: harness.context, api: harness.api)
        StubURLProtocol.stub("POST", "/api/entries", status: 500, json: #"{"error": "boom"}"#)

        let create = EntryCreate(foodId: "f1", mealType: "dinner", servings: 1, date: "2026-06-01")
        await #expect(throws: (any Error).self) {
            try await repo.createEntry(create, food: harness.food(id: "f1", name: "Rice"))
        }

        let day = repo.entries(date: "2026-06-01")
        #expect(day.count == 1)
        #expect(LocalStore.isTempId(day.first?.id ?? ""))
        #expect(day.first?.displayName == "Rice")
    }

    @Test("Entry delete removes the local row and skips the API for temp ids")
    func entryDeleteSkipsAPIForTempIds() async throws {
        let harness = try RepositoryHarness()
        let repo = EntryRepository(context: harness.context, api: harness.api)
        let tempId = LocalStore.makeTempId()
        try harness.context.insert(LocalEntry(entry: harness.entry(id: tempId, date: "2026-06-01"), date: "2026-06-01"))
        try harness.context.save()

        try await repo.deleteEntry(id: tempId)

        #expect(repo.entries(date: "2026-06-01").isEmpty)
        #expect(!StubURLProtocol.recordedRequests.contains { $0.hasPrefix("DELETE") })
    }

    @Test("Day properties write locally first and survive an API failure")
    func dayPropertiesKeepLocalOnAPIFailure() async throws {
        let harness = try RepositoryHarness()
        let repo = EntryRepository(context: harness.context, api: harness.api)
        StubURLProtocol.stub("POST", "/api/day-properties/2026-06-01", status: 500, json: #"{"error": "boom"}"#)

        await #expect(throws: (any Error).self) {
            try await repo.setDayProperties(date: "2026-06-01", isFastingDay: true)
        }

        #expect(repo.isFastingDay(date: "2026-06-01") == true)
    }

    // MARK: Foods

    @Test("Food create replaces the temp id with the server record")
    func foodCreateReplacesTempId() async throws {
        let harness = try RepositoryHarness()
        let repo = FoodRepository(context: harness.context, api: harness.api)
        StubURLProtocol.stub("POST", "/api/foods", json: """
        {"food": {
            "id": "f-server", "userId": "u1", "name": "Skyr", "servingSize": 150, "servingUnit": "g",
            "calories": 98, "protein": 16, "carbs": 6, "fat": 0.2, "fiber": 0, "isFavorite": false
        }}
        """)

        let create = FoodCreate(
            name: "Skyr", servingSize: 150, servingUnit: .g,
            calories: 98, protein: 16, carbs: 6, fat: 0.2, fiber: 0
        )
        let created = try await repo.createFood(create)

        #expect(created.id == "f-server")
        #expect(repo.food(id: "f-server")?.name == "Skyr")
        #expect(repo.searchLocal("Skyr").count == 1)
    }

    @Test("Food create keeps the temp row when the API fails")
    func foodCreateKeepsTempRowOnFailure() async throws {
        let harness = try RepositoryHarness()
        let repo = FoodRepository(context: harness.context, api: harness.api)
        StubURLProtocol.stub("POST", "/api/foods", status: 500, json: #"{"error": "boom"}"#)

        let create = FoodCreate(
            name: "Skyr", servingSize: 150, servingUnit: .g,
            calories: 98, protein: 16, carbs: 6, fat: 0.2, fiber: 0
        )
        await #expect(throws: (any Error).self) {
            try await repo.createFood(create)
        }

        let local = repo.searchLocal("Skyr")
        #expect(local.count == 1)
        #expect(LocalStore.isTempId(local.first?.id ?? ""))
    }

    @Test("Toggle favorite flips the local row before the API call")
    func toggleFavoriteUpdatesLocalFirst() async throws {
        let harness = try RepositoryHarness()
        let repo = FoodRepository(context: harness.context, api: harness.api)
        try harness.context.insert(LocalFood(food: harness.food(id: "f1", name: "Rice")))
        try harness.context.save()
        StubURLProtocol.stub("PATCH", "/api/foods/f1", status: 500, json: #"{"error": "boom"}"#)

        await #expect(throws: (any Error).self) {
            try await repo.toggleFavorite(foodId: "f1", isFavorite: true)
        }

        #expect(repo.food(id: "f1")?.isFavorite == true)
        #expect(repo.favorites().map(\.id) == ["f1"])
    }

    @Test("Favorites refresh upserts foods and recipes and reconciles un-favorited rows")
    func refreshFavoritesReconciles() async throws {
        let harness = try RepositoryHarness()
        let repo = FoodRepository(context: harness.context, api: harness.api)
        try harness.context.insert(LocalFood(food: harness.food(id: "f1", name: "Old Fav", isFavorite: true)))
        try harness.context.save()
        StubURLProtocol.stub("GET", "/api/favorites", json: """
        {
            "foods": [{
                "id": "f2", "userId": "u1", "name": "New Fav", "servingSize": 100, "servingUnit": "g",
                "calories": 50, "protein": 5, "carbs": 5, "fat": 1, "fiber": 1, "isFavorite": true
            }],
            "recipes": [{
                "id": "r1", "userId": "u1", "name": "Fav Recipe", "totalServings": 1, "isFavorite": true
            }]
        }
        """)

        try await repo.refreshFavorites()

        #expect(repo.favorites().map(\.id) == ["f2"])
        #expect(repo.food(id: "f1")?.isFavorite == false)
        let recipeRepo = RecipeRepository(context: harness.context, api: harness.api)
        #expect(recipeRepo.favoriteRecipes().map(\.id) == ["r1"])
    }

    @Test("Barcode lookup answers from the local store before hitting the API")
    func findByBarcodePrefersLocal() async throws {
        let harness = try RepositoryHarness()
        let repo = FoodRepository(context: harness.context, api: harness.api)
        try harness.context.insert(LocalFood(food: harness.food(id: "f1", name: "Bar", barcode: "123")))
        try harness.context.save()

        let found = try await repo.findByBarcode("123")

        #expect(found?.id == "f1")
        #expect(StubURLProtocol.recordedRequests.isEmpty)
    }

    // MARK: Recipes

    @Test("Recipe refresh upserts by id, drops server-deleted rows and keeps temp rows")
    func recipeRefreshUpserts() async throws {
        let harness = try RepositoryHarness()
        let repo = RecipeRepository(context: harness.context, api: harness.api)
        let tempId = LocalStore.makeTempId()
        try harness.context.insert(LocalRecipe(recipe: harness.recipe(id: "r1", name: "Stale")))
        try harness.context.insert(LocalRecipe(recipe: harness.recipe(id: tempId, name: "Pending")))
        try harness.context.save()
        StubURLProtocol.stub("GET", "/api/recipes", json: """
        {"recipes": [{
            "id": "r2", "userId": "u1", "name": "Fresh", "totalServings": 4,
            "isFavorite": false, "calories": 800, "protein": 40, "carbs": 90, "fat": 25, "fiber": 10
        }]}
        """)

        try await repo.refresh()

        let ids = Set(repo.recipes().map(\.id))
        #expect(ids == [tempId, "r2"])
        #expect(repo.recipe(id: "r2")?.calories == 800)
    }

    @Test("Recipe create replaces the temp id with the server record")
    func recipeCreateReplacesTempId() async throws {
        let harness = try RepositoryHarness()
        let repo = RecipeRepository(context: harness.context, api: harness.api)
        StubURLProtocol.stub("POST", "/api/recipes", json: """
        {"recipe": {
            "id": "r-server", "userId": "u1", "name": "Bowl", "totalServings": 2,
            "isFavorite": false, "calories": 500, "protein": 30, "carbs": 60, "fat": 15, "fiber": 8
        }}
        """)

        let create = RecipeCreate(
            name: "Bowl",
            totalServings: 2,
            ingredients: [RecipeIngredientInput(foodId: "f1", quantity: 80, servingUnit: .g)]
        )
        let created = try await repo.createRecipe(create)

        #expect(created.id == "r-server")
        #expect(repo.recipes().map(\.id) == ["r-server"])
        #expect(repo.recipe(id: "r-server")?.calories == 500)
    }

    // MARK: Weight

    @Test("Weight refresh upserts by id and updates changed rows")
    func weightRefreshUpsertsById() async throws {
        let harness = try RepositoryHarness()
        let repo = WeightRepository(context: harness.context, api: harness.api)
        try harness.context.insert(LocalWeightEntry(entry: harness.weight(id: "w1", date: "2026-06-01", kg: 80)))
        try harness.context.save()
        StubURLProtocol.stub("GET", "/api/weight", json: """
        {"entries": [
            {"id": "w1", "userId": "u1", "weightKg": 81, "entryDate": "2026-06-01"},
            {"id": "w2", "userId": "u1", "weightKg": 80.4, "entryDate": "2026-06-02"}
        ]}
        """)

        try await repo.refresh()

        let entries = repo.entries()
        #expect(entries.map(\.id) == ["w2", "w1"]) // newest first
        #expect(entries.last?.weightKg == 81)
        #expect(repo.latest()?.id == "w2")
    }

    @Test("Weight create writes locally then replaces the temp row with the server record")
    func weightCreateReplacesTempId() async throws {
        let harness = try RepositoryHarness()
        let repo = WeightRepository(context: harness.context, api: harness.api)
        StubURLProtocol.stub("POST", "/api/weight", json: """
        {"entry": {"id": "w-server", "userId": "u1", "weightKg": 74.2, "entryDate": "2026-06-01"}}
        """)

        let created = try await repo.createEntry(WeightCreate(weightKg: 74.2, entryDate: "2026-06-01"))

        #expect(created.id == "w-server")
        #expect(repo.entries().map(\.id) == ["w-server"])
    }

    @Test("Weight create keeps the temp row when the API fails")
    func weightCreateKeepsTempRowOnFailure() async throws {
        let harness = try RepositoryHarness()
        let repo = WeightRepository(context: harness.context, api: harness.api)
        StubURLProtocol.stub("POST", "/api/weight", status: 500, json: #"{"error": "boom"}"#)

        await #expect(throws: (any Error).self) {
            try await repo.createEntry(WeightCreate(weightKg: 74.2, entryDate: "2026-06-01"))
        }

        let entries = repo.entries()
        #expect(entries.count == 1)
        #expect(LocalStore.isTempId(entries.first?.id ?? ""))
        #expect(entries.first?.weightKg == 74.2)
    }

    // MARK: Supplements

    @Test("Supplement log writes the local row even when the API fails")
    func supplementLogKeepsLocalOnFailure() async throws {
        let harness = try RepositoryHarness()
        let repo = SupplementRepository(context: harness.context, api: harness.api)
        try harness.context.insert(LocalSupplement(supplement: harness.supplement(id: "s1", name: "Vitamin D")))
        try harness.context.save()
        StubURLProtocol.stub("POST", "/api/supplements/s1/log", status: 500, json: #"{"error": "boom"}"#)

        await #expect(throws: (any Error).self) {
            try await repo.logSupplement(id: "s1", date: "2026-06-01")
        }

        #expect(repo.loggedSupplementIds(date: "2026-06-01") == ["s1"])
        #expect(repo.localChecklist(date: "2026-06-01").first?.taken == true)
    }

    @Test("Checklist refresh replaces the cached logs for the day")
    func checklistRefreshReplacesLogsByDate() async throws {
        let harness = try RepositoryHarness()
        let repo = SupplementRepository(context: harness.context, api: harness.api)
        try harness.context.insert(LocalSupplement(supplement: harness.supplement(id: "s1", name: "Vitamin D")))
        try harness.context.insert(LocalSupplement(supplement: harness.supplement(
            id: "s2",
            name: "Omega-3",
            sortOrder: 1
        )))
        harness.context.insert(LocalSupplementLog(supplementId: "s1", date: "2026-06-01", takenAt: "old"))
        try harness.context.save()
        StubURLProtocol.stub("GET", "/api/supplements/2026-06-01/checklist", json: """
        {"checklist": [
            {
                "supplement": {"id": "s1", "userId": "u1", "name": "Vitamin D", "scheduleType": "daily", "isActive": true, "sortOrder": 0, "ingredients": []},
                "taken": false, "takenAt": null
            },
            {
                "supplement": {"id": "s2", "userId": "u1", "name": "Omega-3", "scheduleType": "daily", "isActive": true, "sortOrder": 1, "ingredients": []},
                "taken": true, "takenAt": "2026-06-01T08:00:00Z"
            }
        ]}
        """)

        let checklist = try await repo.refreshChecklist(date: "2026-06-01")

        #expect(checklist.count == 2)
        #expect(repo.loggedSupplementIds(date: "2026-06-01") == ["s2"])
    }

    @Test("Supplement create replaces the temp id with the server record")
    func supplementCreateReplacesTempId() async throws {
        let harness = try RepositoryHarness()
        let repo = SupplementRepository(context: harness.context, api: harness.api)
        StubURLProtocol.stub("POST", "/api/supplements", json: """
        {"supplement": {
            "id": "s-server", "userId": "u1", "name": "Magnesium",
            "scheduleType": "daily", "isActive": true, "sortOrder": 0, "ingredients": []
        }}
        """)

        let create = SupplementCreate(name: "Magnesium", scheduleType: .daily, ingredients: [])
        let created = try await repo.createSupplement(create)

        #expect(created.id == "s-server")
        #expect(repo.supplements().map(\.id) == ["s-server"])
    }

    // MARK: Goals

    @Test("Goals write locally first and survive an API failure")
    func goalsKeepLocalOnAPIFailure() async throws {
        let harness = try RepositoryHarness()
        let repo = GoalsRepository(context: harness.context, api: harness.api)
        StubURLProtocol.stub("POST", "/api/goals", status: 500, json: #"{"error": "boom"}"#)

        let goals = Goals(
            calorieGoal: 2100, proteinGoal: 155, carbGoal: 230,
            fatGoal: 68, fiberGoal: 32, sodiumGoal: nil, sugarGoal: nil
        )
        await #expect(throws: (any Error).self) {
            try await repo.setGoals(goals)
        }

        #expect(repo.goals()?.calorieGoal == 2100)
        #expect(repo.goals()?.proteinGoal == 155)
    }

    @Test("Goals refresh caches the server value")
    func goalsRefreshCachesServerValue() async throws {
        let harness = try RepositoryHarness()
        let repo = GoalsRepository(context: harness.context, api: harness.api)
        StubURLProtocol.stub("GET", "/api/goals", json: """
        {"goals": {"calorieGoal": 1900, "proteinGoal": 140, "carbGoal": 200, "fatGoal": 60, "fiberGoal": 28}}
        """)

        try await repo.refresh()

        #expect(repo.goals()?.calorieGoal == 1900)
        #expect(repo.goals()?.fiberGoal == 28)
    }

    // MARK: Preferences

    @Test("Preferences update merges the partial update onto the cached value locally")
    func preferencesUpdateMergesLocally() async throws {
        let harness = try RepositoryHarness()
        let repo = PreferencesRepository(context: harness.context, api: harness.api)
        harness.context.insert(LocalPreferences(preferences: .defaults))
        try harness.context.save()
        StubURLProtocol.stub("PATCH", "/api/preferences", status: 500, json: #"{"error": "boom"}"#)

        var update = PreferencesUpdate()
        update.showWeightWidget = false
        update.visibleNutrients = ["sugar"]
        await #expect(throws: (any Error).self) {
            try await repo.update(update)
        }

        let merged = try #require(repo.preferences())
        #expect(merged.showWeightWidget == false)
        #expect(merged.visibleNutrients == ["sugar"])
        // Untouched fields keep their cached values.
        #expect(merged.showChartWidget == Preferences.defaults.showChartWidget)
        #expect(merged.startPage == Preferences.defaults.startPage)
    }
}
