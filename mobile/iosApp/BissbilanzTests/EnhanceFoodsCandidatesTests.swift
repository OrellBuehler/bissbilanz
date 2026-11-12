@testable import Bissbilanz
import Foundation
import SwiftData
import Testing

@Suite("Enhance foods candidates")
@MainActor
struct EnhanceFoodsCandidatesTests {
    private func food(id: String, name: String, _ extra: [String: Any] = [:]) throws -> Food {
        var fields: [String: Any] = [
            "id": id, "userId": "u1", "name": name, "servingSize": 100, "servingUnit": "g",
            "calories": 100, "protein": 1, "carbs": 1, "fat": 1, "fiber": 1, "isFavorite": false,
        ]
        fields.merge(extra) { _, new in new }
        return try JSONPatch.decode(Food.self, from: fields)
    }

    private func stamp(daysAgo days: Double) -> String {
        DateFormatting.isoDateTimeString(from: Date().addingTimeInterval(-days * 24 * 60 * 60))
    }

    private func offRepository(_ harness: RepositoryHarness) -> FoodRepository {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        return FoodRepository(
            context: harness.context,
            api: harness.api,
            appMode: harness.appMode,
            syncManager: harness.syncManager,
            defaults: harness.defaults,
            openFoodFacts: OpenFoodFactsClient(session: URLSession(configuration: configuration))
        )
    }

    private func stubOff(_ barcode: String, status: Int = 200, json: String) {
        StubURLProtocol.stub(
            "GET",
            "https://world.openfoodfacts.org/api/v2/product/\(barcode).json",
            status: status,
            json: json
        )
    }

    private func enrichedFoodJSON(id: String, extra: String = "") -> String {
        """
        {"food": {"id": "\(id)", "userId": "u1", "name": "Skyr", "servingSize": 150, "servingUnit": "g",
         "calories": 90, "protein": 15, "carbs": 6, "fat": 0.3, "fiber": 0, "isFavorite": false,
         "barcode": "111", "nutriScore": "a", "novaGroup": 1, "offCheckedAt": "2026-11-12T08:00:00.000Z"\(extra)},
         "outcome": "updated"}
        """
    }

    @Test("Only barcode foods missing a score or ingredients are candidates, sorted by name")
    func candidateFilter() throws {
        let harness = try RepositoryHarness()
        let foods = try [
            food(id: "full", name: "Complete", [
                "barcode": "111", "nutriScore": "a", "novaGroup": 1, "ingredientsText": "Milk",
            ]),
            food(id: "no-barcode", name: "Homemade"),
            food(id: "blank-barcode", name: "Blank", ["barcode": "  "]),
            food(id: "no-nova", name: "Zebra", [
                "barcode": "222", "nutriScore": "b", "ingredientsText": "Oats",
            ]),
            food(id: "no-score", name: "Apple", [
                "barcode": "333", "novaGroup": 1, "ingredientsText": "Apple",
            ]),
            food(id: "no-ingredients", name: "Mango", [
                "barcode": "444", "nutriScore": "c", "novaGroup": 3, "ingredientsText": "",
            ]),
            food(id: "bare", name: "Bread", ["barcode": "555"]),
        ]
        for food in foods {
            harness.context.insert(LocalFood(food: food))
        }
        try harness.context.save()

        let candidates = harness.foodRepository.unenrichedLocalFoods().map(\.id)
        #expect(candidates == ["no-score", "bare", "no-ingredients", "no-nova"])
    }

    @Test("Foods checked in the last 30 days are not candidates again")
    func checkedFoodsAreSkipped() throws {
        let harness = try RepositoryHarness()
        let foods = try [
            food(id: "recent", name: "Recent", ["barcode": "111", "offCheckedAt": stamp(daysAgo: 3)]),
            food(id: "stale", name: "Stale", ["barcode": "222", "offCheckedAt": stamp(daysAgo: 31)]),
            food(id: "never", name: "Never", ["barcode": "333"]),
            food(id: "garbled", name: "Garbled", ["barcode": "444", "offCheckedAt": "not a date"]),
        ]
        for food in foods {
            harness.context.insert(LocalFood(food: food))
        }
        try harness.context.save()

        let candidates = harness.foodRepository.unenrichedLocalFoods().map(\.id)
        #expect(candidates == ["garbled", "never", "stale"])
    }

    @Test("A stored row without offCheckedAt still decodes")
    func legacyRowDecodes() throws {
        let legacy = Data("""
        {"id": "f1", "userId": "u1", "name": "Old", "servingSize": 100, "servingUnit": "g",
         "calories": 1, "protein": 1, "carbs": 1, "fat": 1, "fiber": 1, "isFavorite": false, "barcode": "111"}
        """.utf8)
        let decoded = try #require(LocalStoreCoding.decode(Food.self, from: legacy))
        #expect(decoded.offCheckedAt == nil)
        #expect(FoodEnrichmentRules.needsEnrichment(decoded))
    }

    @Test("Signed in, enriching calls the server and stores the returned food without queueing a sync")
    func signedInEnrichStoresServerFood() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.foodRepository
        try harness.context.insert(LocalFood(food: food(id: "f1", name: "Skyr", ["barcode": "111"])))
        try harness.context.save()
        harness.stub("POST", "/api/foods/f1/enrich", json: enrichedFoodJSON(id: "f1"))

        let result = try await repo.enrichFood(id: "f1")

        #expect(result.outcome == .updated)
        #expect(result.food.nutriScore == "a")
        #expect(repo.food(id: "f1")?.novaGroup == 1)
        #expect(repo.food(id: "f1")?.offCheckedAt == "2026-11-12T08:00:00.000Z")
        #expect(harness.recordedRequests.filter { $0.hasPrefix("POST /api/foods") } == ["POST /api/foods/f1/enrich"])
        #expect(harness.syncManager.queuedRows().isEmpty)
    }

    @Test("Signed in, an unknown outcome reads as unchanged")
    func unknownOutcomeIsUnchanged() async throws {
        let harness = try RepositoryHarness()
        try harness.context.insert(LocalFood(food: food(id: "f1", name: "Skyr", ["barcode": "111"])))
        try harness.context.save()
        let json = enrichedFoodJSON(id: "f1").replacingOccurrences(of: "\"updated\"", with: "\"merged_later\"")
        harness.stub("POST", "/api/foods/f1/enrich", json: json)

        let result = try await harness.foodRepository.enrichFood(id: "f1")

        #expect(result.outcome == .unchanged)
    }

    @Test("Signed in, a food with a queued edit is not sent for enrichment")
    func pendingEditBlocksEnrich() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.foodRepository
        try harness.context.insert(LocalFood(food: food(id: "f1", name: "Skyr", ["barcode": "111"])))
        try harness.context.save()
        _ = try await repo.toggleFavorite(foodId: "f1", isFavorite: true)

        await #expect(throws: FoodEnrichmentFailure.pendingChanges) {
            try await repo.enrichFood(id: "f1")
        }
        #expect(!harness.recordedRequests.contains("POST /api/foods/f1/enrich"))
    }

    @Test("Signed in, a not yet uploaded food is not sent for enrichment")
    func tempFoodBlocksEnrich() async throws {
        let harness = try RepositoryHarness()
        let id = LocalStore.makeTempId()
        try harness.context.insert(LocalFood(food: food(id: id, name: "Skyr", ["barcode": "111"])))
        try harness.context.save()

        await #expect(throws: FoodEnrichmentFailure.pendingChanges) {
            try await harness.foodRepository.enrichFood(id: id)
        }
        #expect(harness.recordedRequests.isEmpty)
    }

    @Test("Signed in, error codes map to distinct failures")
    func errorCodesMapToFailures() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.foodRepository
        try harness.context.insert(LocalFood(food: food(id: "f1", name: "Skyr", ["barcode": "111"])))
        try harness.context.save()
        let path = "/api/foods/f1/enrich"

        harness.stub("POST", path, status: 400, json: #"{"error": "No barcode", "code": "no_barcode"}"#)
        await #expect(throws: FoodEnrichmentFailure.noBarcode) { try await repo.enrichFood(id: "f1") }

        harness.stub("POST", path, status: 404, json: #"{"error": "Food not found", "code": "food_not_found"}"#)
        await #expect(throws: FoodEnrichmentFailure.foodNotFound) { try await repo.enrichFood(id: "f1") }

        harness.stub("POST", path, status: 409, json: #"{"error": "Food changed", "code": "food_changed"}"#)
        await #expect(throws: FoodEnrichmentFailure.foodChanged) { try await repo.enrichFood(id: "f1") }

        harness.stub(
            "POST", path, status: 429,
            json: #"{"error": "Too many requests"}"#,
            headers: ["Retry-After": "12"]
        )
        await #expect(throws: FoodEnrichmentFailure.rateLimited(retryAfter: 12)) { try await repo.enrichFood(id: "f1") }

        harness.stub("POST", path, status: 502, json: #"{"error": "Bad", "code": "off_invalid_response"}"#)
        await #expect(throws: FoodEnrichmentFailure.offInvalidResponse) { try await repo.enrichFood(id: "f1") }

        harness.stub(
            "POST", path, status: 503,
            json: #"{"error": "Down", "code": "off_unavailable"}"#,
            headers: ["Retry-After": "30"]
        )
        await #expect(throws: FoodEnrichmentFailure.offUnavailable(retryAfter: 30)) {
            try await repo.enrichFood(id: "f1")
        }

        harness.stub("POST", path, status: 500, json: #"{"error": "Boom"}"#)
        await #expect(throws: FoodEnrichmentFailure.failed(status: 500)) { try await repo.enrichFood(id: "f1") }

        #expect(repo.food(id: "f1")?.nutriScore == nil)
        #expect(harness.syncManager.queuedRows().isEmpty)
    }

    @Test("Local mode merges the product into empty fields only, scaled to the serving, and marks the food checked")
    func localEnrichMergesAndMarksChecked() async throws {
        let harness = try RepositoryHarness(mode: .local)
        let repo = offRepository(harness)
        try harness.context.insert(LocalFood(food: food(id: "f1", name: "Crackers", [
            "barcode": "7610000000101", "servingSize": 30, "ingredientsText": "My own list",
            "imageUrl": "file:///photo.jpg", "sugar": 5,
        ])))
        try harness.context.save()
        stubOff("7610000000101", json: """
        {"status": 1, "product": {
            "product_name": "Other name", "nutriscore_grade": "b", "nova_group": 4,
            "additives_tags": ["en:e322"], "ingredients_text": "Wheat flour, salt",
            "image_front_url": "https://images.openfoodfacts.org/images/products/761/front.jpg",
            "nutriments": {"energy-kcal_100g": 380, "sodium_100g": 0.4, "salt_100g": 1, "sugars_100g": 20}
        }}
        """)

        let result = try await repo.enrichFood(id: "f1")
        let stored = try #require(repo.food(id: "f1"))

        #expect(result.outcome == .updated)
        #expect(stored.name == "Crackers")
        #expect(stored.calories == 100)
        #expect(stored.nutriScore == "b")
        #expect(stored.novaGroup == 4)
        #expect(stored.additives == ["en:e322"])
        #expect(stored.ingredientsText == "My own list")
        #expect(stored.imageUrl == "file:///photo.jpg")
        #expect(stored.sodium == 120)
        #expect(stored.salt == 0.3)
        #expect(stored.sugar == 5)
        #expect(stored.offCheckedAt != nil)
        #expect(repo.unenrichedLocalFoods().isEmpty)
    }

    @Test("Local mode records a not-found product as checked and leaves the food alone")
    func localNotFoundMarksChecked() async throws {
        let harness = try RepositoryHarness(mode: .local)
        let repo = offRepository(harness)
        try harness.context.insert(LocalFood(food: food(id: "f1", name: "Mystery", ["barcode": "7610000000102"])))
        try harness.context.save()
        stubOff("7610000000102", json: #"{"status": 0, "status_verbose": "product not found"}"#)

        let result = try await repo.enrichFood(id: "f1")

        #expect(result.outcome == .notFound)
        #expect(repo.food(id: "f1")?.nutriScore == nil)
        #expect(repo.food(id: "f1")?.offCheckedAt != nil)
        #expect(repo.unenrichedLocalFoods().isEmpty)
    }

    @Test("Local mode does not mark a food checked when Open Food Facts is unavailable")
    func localUnavailableDoesNotMark() async throws {
        let harness = try RepositoryHarness(mode: .local)
        let repo = offRepository(harness)
        try harness.context.insert(LocalFood(food: food(id: "f1", name: "Skyr", ["barcode": "7610000000103"])))
        try harness.context.save()
        stubOff("7610000000103", status: 503, json: #"{"error": "busy"}"#)

        await #expect(throws: FoodEnrichmentFailure.offUnavailable(retryAfter: nil)) {
            try await repo.enrichFood(id: "f1")
        }
        #expect(repo.food(id: "f1")?.offCheckedAt == nil)
        #expect(repo.unenrichedLocalFoods().map(\.id) == ["f1"])
    }

    @Test("Local mode reports a product it cannot read without marking the food")
    func localInvalidDoesNotMark() async throws {
        let harness = try RepositoryHarness(mode: .local)
        let repo = offRepository(harness)
        try harness.context.insert(LocalFood(food: food(id: "f1", name: "Skyr", ["barcode": "7610000000104"])))
        try harness.context.save()
        stubOff("7610000000104", json: #"{"product": {}}"#)

        await #expect(throws: FoodEnrichmentFailure.offInvalidResponse) {
            try await repo.enrichFood(id: "f1")
        }
        #expect(repo.food(id: "f1")?.offCheckedAt == nil)
    }

    @Test("Changing a food's barcode clears its checked marker")
    func barcodeEditClearsMarker() async throws {
        let harness = try RepositoryHarness(mode: .local)
        let repo = harness.foodRepository
        try harness.context.insert(LocalFood(food: food(id: "f1", name: "Skyr", [
            "barcode": "111", "offCheckedAt": stamp(daysAgo: 1),
        ])))
        try harness.context.save()
        let edit = try JSONPatch.decode(FoodCreate.self, from: [
            "name": "Skyr", "servingSize": 100, "servingUnit": "g",
            "calories": 100, "protein": 1, "carbs": 1, "fat": 1, "fiber": 1, "barcode": "222",
        ])

        _ = try await repo.updateFood(id: "f1", edit)

        #expect(repo.food(id: "f1")?.barcode == "222")
        #expect(repo.food(id: "f1")?.offCheckedAt == nil)
    }
}
