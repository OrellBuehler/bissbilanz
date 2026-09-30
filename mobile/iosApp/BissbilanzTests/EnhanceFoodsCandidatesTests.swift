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

    @Test("Enriching tells a missing product apart from a rate limit")
    func enrichDistinguishesNotFoundFromRateLimit() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.foodRepository
        try harness.context.insert(LocalFood(food: food(id: "f1", name: "Skyr", ["barcode": "111"])))
        try harness.context.insert(LocalFood(food: food(id: "f2", name: "Quark", ["barcode": "222"])))
        try harness.context.save()
        harness.stub("GET", "/api/openfoodfacts/111", status: 404, json: #"{"error": "Product not found"}"#)
        harness.stub("GET", "/api/openfoodfacts/222", status: 429, json: #"{"error": "Rate limit exceeded"}"#)

        do {
            try await repo.enrichFood(id: "f1", barcode: "111")
            Issue.record("expected notFound")
        } catch APIError.notFound {}

        do {
            try await repo.enrichFood(id: "f2", barcode: "222")
            Issue.record("expected a 429 server error")
        } catch APIError.serverError(429, _) {}
    }
}
