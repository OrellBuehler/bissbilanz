@testable import Bissbilanz
import Foundation
import Testing

@Suite("Open Food Facts direct client")
@MainActor
struct OpenFoodFactsClientTests {
    private func makeClient() -> OpenFoodFactsClient {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        return OpenFoodFactsClient(session: URLSession(configuration: configuration))
    }

    private func stubProduct(_ barcode: String, json: String) {
        StubURLProtocol.stub(
            "GET",
            "https://world.openfoodfacts.org/api/v2/product/\(barcode).json",
            json: json
        )
    }

    @Test("Maps an OFF product onto the Food prefill shape with unit conversions")
    func mapsProductWithConversions() async throws {
        stubProduct("7610000000001", json: """
        {
            "status": 1,
            "product": {
                "product_name": "Crackers",
                "brands": "Acme",
                "nutriscore_grade": "b",
                "nova_group": 4,
                "additives_tags": ["en:e322"],
                "ingredients_text": "Wheat flour, salt",
                "image_front_url": "https://images.example/crackers.jpg",
                "nutriments": {
                    "energy-kcal_100g": 380,
                    "proteins_100g": "9.7",
                    "carbohydrates_100g": 71.4,
                    "fat_100g": 4.5,
                    "fiber_100g": 2,
                    "sodium_100g": 0.512,
                    "vitamin-c_100g": 0.012,
                    "vitamin-b12_100g": 0.0000007,
                    "salt_100g": 1.28
                }
            }
        }
        """)

        let food = try #require(try await makeClient().lookupBarcode("7610000000001"))

        #expect(food.name == "Crackers")
        #expect(food.brand == "Acme")
        #expect(food.barcode == "7610000000001")
        #expect(food.servingSize == 100)
        #expect(food.servingUnit == .g)
        #expect(food.calories == 380)
        #expect(food.protein == 9.7) // numeric string
        #expect(food.carbs == 71.4)
        #expect(food.fat == 4.5)
        #expect(food.fiber == 2)
        #expect(food.sodium == 512) // g → mg
        #expect(food.vitaminC == 12) // g → mg
        #expect(food.vitaminB12 == 0.7) // g → µg
        #expect(food.salt == 1.28)
        #expect(food.nutriScore == "b")
        #expect(food.novaGroup == 4)
        #expect(food.additives == ["en:e322"])
        #expect(food.ingredientsText == "Wheat flour, salt")
        #expect(food.imageUrl == "https://images.example/crackers.jpg")
    }

    @Test("Unknown products and invalid payloads return nil")
    func unknownProductReturnsNil() async throws {
        stubProduct("7610000000002", json: #"{"status": 0, "status_verbose": "product not found"}"#)
        #expect(try await makeClient().lookupBarcode("7610000000002") == nil)

        stubProduct("7610000000003", json: "not json")
        #expect(try await makeClient().lookupBarcode("7610000000003") == nil)

        StubURLProtocol.stub(
            "GET",
            "https://world.openfoodfacts.org/api/v2/product/7610000000004.json",
            status: 500,
            json: #"{"error": "boom"}"#
        )
        #expect(try await makeClient().lookupBarcode("7610000000004") == nil)
    }

    @Test("Missing optional fields map to defaults")
    func missingFieldsMapToDefaults() async throws {
        stubProduct("7610000000005", json: """
        {"status": 1, "product": {"product_name": "Mystery", "nutriments": {}}}
        """)

        let food = try #require(try await makeClient().lookupBarcode("7610000000005"))

        #expect(food.name == "Mystery")
        #expect(food.brand == nil)
        #expect(food.calories == 0)
        #expect(food.protein == 0)
        #expect(food.nutriScore == nil)
        #expect(food.novaGroup == nil)
        #expect(food.saturatedFat == nil)
        #expect(food.imageUrl == nil)
    }
}
