@testable import Bissbilanz
import Foundation
import Testing

@Suite("Open Food Facts import and barcode lookup outcomes")
@MainActor
struct OpenFoodFactsImportTests {
    private static let offImage = "https://images.openfoodfacts.org/images/products/761/000/000/0001/front_en.4.400.jpg"

    private func food(_ overrides: [String: Any] = [:]) throws -> Food {
        var dict: [String: Any] = [
            "id": "7610000000001", "userId": "", "name": "Crackers", "brand": "Acme",
            "servingSize": 100, "servingUnit": "g",
            "calories": 380, "protein": 9.7, "carbs": 71.4, "fat": 4.5, "fiber": 2,
            "barcode": "7610000000001", "isFavorite": false,
            "nutriScore": "b", "novaGroup": 4, "additives": ["en:e322"], "ingredientsText": "Wheat flour, salt",
            "imageUrl": Self.offImage,
        ]
        dict.merge(overrides) { _, new in new }
        return try JSONPatch.decode(Food.self, from: dict)
    }

    private func hit(_ overrides: [String: Any] = [:], categoriesTags: [String]? = nil) throws -> BissbilanzAPI.OpenFoodFactsHit {
        try BissbilanzAPI.OpenFoodFactsHit(food: food(overrides), categoriesTags: categoriesTags)
    }

    // MARK: - Mapping onto FoodCreate

    @Test("Every catalog nutrient is copied to the create payload under its own key, unscaled")
    func copiesEveryCatalogNutrient() throws {
        let keys = NutrientCatalog.all.map(\.key)
        var overrides: [String: Any] = [:]
        for (index, key) in keys.enumerated() {
            overrides[key] = Double(index) + 0.25
        }

        let create = try FoodCreate(openFoodFacts: hit(overrides), barcode: "7610000000001")
        let payload = try JSONPatch.dictionary(of: create)

        #expect(keys.count == 43)
        for (index, key) in keys.enumerated() {
            #expect((payload[key] as? Double) == Double(index) + 0.25, "\(key)")
        }
    }

    @Test("Identity, macros, quality data, photo and categories come across")
    func copiesCoreFieldsAndPhoto() throws {
        let create = try FoodCreate(
            openFoodFacts: hit(["sodium": 512, "vitaminB12": 0.7], categoriesTags: ["en:crackers"]),
            barcode: "7610000000099"
        )

        #expect(create.name == "Crackers")
        #expect(create.brand == "Acme")
        #expect(create.servingSize == 100)
        #expect(create.servingUnit == .g)
        #expect(create.calories == 380)
        #expect(create.protein == 9.7)
        #expect(create.carbs == 71.4)
        #expect(create.fat == 4.5)
        #expect(create.fiber == 2)
        #expect(create.barcode == "7610000000099")
        #expect(create.nutriScore == "b")
        #expect(create.novaGroup == 4)
        #expect(create.additives == ["en:e322"])
        #expect(create.ingredientsText == "Wheat flour, salt")
        #expect(create.imageUrl == Self.offImage)
        #expect(create.categoriesTags == ["en:crackers"])
        #expect(create.sodium == 512)
        #expect(create.vitaminB12 == 0.7)
        #expect(create.saturatedFat == nil)
        #expect(create.isFavorite == nil)
    }

    @Test("A product photo is only taken from an Open Food Facts image host over https")
    func photoHostIsRestricted() throws {
        #expect(try FoodCreate(openFoodFacts: hit(["imageUrl": "http://images.openfoodfacts.org/a.jpg"]), barcode: "1").imageUrl == nil)
        #expect(try FoodCreate(openFoodFacts: hit(["imageUrl": "https://example.com/a.jpg"]), barcode: "1").imageUrl == nil)
        #expect(try FoodCreate(openFoodFacts: hit(["imageUrl": "https://images.openfoodfacts.net/a.jpg"]), barcode: "1").imageUrl
            == "https://images.openfoodfacts.net/a.jpg")
        #expect(try FoodCreate(openFoodFacts: hit(["imageUrl": NSNull()]), barcode: "1").imageUrl == nil)
    }

    @Test("A negative nutrient from Open Food Facts is dropped rather than failing the create")
    func negativeNutrientIsDropped() throws {
        let create = try FoodCreate(openFoodFacts: hit(["sugar": -1, "salt": 1.28]), barcode: "1")
        #expect(create.sugar == nil)
        #expect(create.salt == 1.28)
    }

    // MARK: - Server proxy response classification

    private func proxyBody(_ product: String) -> Data {
        Data(#"{"product": \#(product)}"#.utf8)
    }

    @Test("The proxy product decodes with its photo, categories and extended nutrients")
    func proxyProductKeepsExtendedFields() throws {
        let body = proxyBody("""
        {"name": "Pain", "brand": "La Boulangere", "servingSize": 100, "servingUnit": "g",
         "calories": 268, "protein": 8.1, "carbs": 47, "fat": 4.2, "fiber": 4.9,
         "imageUrl": "\(Self.offImage)", "categoriesTags": ["en:breads"],
         "saturatedFat": 0.7, "sodium": 480, "vitaminD": null}
        """)

        let hit = try #require(try BissbilanzAPI.openFoodFactsHit(status: 200, data: body, barcode: "3760049790214"))

        #expect(hit.food.id == "3760049790214")
        #expect(hit.food.barcode == "3760049790214")
        #expect(hit.food.imageUrl == Self.offImage)
        #expect(hit.food.saturatedFat == 0.7)
        #expect(hit.food.sodium == 480)
        #expect(hit.food.vitaminD == nil)
        #expect(hit.categoriesTags == ["en:breads"])
    }

    @Test("Only a 404 or an invalid-barcode 400 means the product is unknown")
    func definitiveAnswersReadAsUnknown() throws {
        #expect(try BissbilanzAPI.openFoodFactsHit(status: 404, data: Data(#"{"error": "Product not found"}"#.utf8), barcode: "1") == nil)
        #expect(try BissbilanzAPI.openFoodFactsHit(status: 400, data: Data(#"{"error": "Invalid barcode format"}"#.utf8), barcode: "1") == nil)
    }

    @Test("Rate limits, server errors and unreadable bodies throw instead of reading as unknown")
    func failuresThrow() {
        for status in [401, 429, 500, 502, 503] {
            do {
                _ = try BissbilanzAPI.openFoodFactsHit(status: status, data: Data("oops".utf8), barcode: "1")
                Issue.record("status \(status) must throw")
            } catch let APIError.serverError(code, body) {
                #expect(code == status)
                #expect(body == "oops")
            } catch {
                Issue.record("status \(status) threw \(error)")
            }
        }

        for body in ["not json", "{}", #"{"product": "x"}"#, #"{"product": {"name": 5}}"#] {
            do {
                _ = try BissbilanzAPI.openFoodFactsHit(status: 200, data: Data(body.utf8), barcode: "1")
                Issue.record("body \(body) must throw")
            } catch let APIError.decodingError(_, statusCode, _) {
                #expect(statusCode == 200)
            } catch {
                Issue.record("body \(body) threw \(error)")
            }
        }
    }

    // MARK: - Repository: Synced mode

    private var proxyProduct: String {
        """
        {"product": {
            "name": "Pain De Mie Bio", "brand": "La Boulangere", "barcode": "3760049790214",
            "servingSize": 100, "servingUnit": "g", "calories": 268, "protein": 8.1, "carbs": 47, "fat": 4.2, "fiber": 4.9,
            "nutriScore": "c", "novaGroup": 4, "additives": [], "ingredientsText": "Flour",
            "imageUrl": "\(Self.offImage)", "categoriesTags": ["en:breads"],
            "saturatedFat": 0.7, "sugar": 3.1, "sodium": 480, "vitaminB12": 0.7, "salt": 1.2
        }}
        """
    }

    @Test("A scanned product is imported with its photo and extended nutrients, and uploads them")
    func syncedImportKeepsPhotoAndNutrients() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.foodRepository
        harness.stub("GET", "/api/foods", json: #"{"foods": []}"#)
        harness.stub("GET", "/api/openfoodfacts/3760049790214", json: proxyProduct)
        harness.stub("POST", "/api/foods", json: """
        {"food": {
            "id": "f-server", "userId": "u1", "name": "Pain De Mie Bio", "servingSize": 100, "servingUnit": "g",
            "calories": 268, "protein": 8.1, "carbs": 47, "fat": 4.2, "fiber": 4.9, "isFavorite": false
        }}
        """)

        guard case let .imported(created) = try await repo.resolveScannedBarcode("3760049790214") else {
            Issue.record("expected an imported food")
            return
        }

        #expect(created.imageUrl == Self.offImage)
        #expect(created.saturatedFat == 0.7)
        #expect(created.sugar == 3.1)
        #expect(created.sodium == 480)
        #expect(created.vitaminB12 == 0.7)
        #expect(created.salt == 1.2)
        #expect(created.nutriScore == "c")
        #expect(repo.food(id: created.id)?.imageUrl == Self.offImage)

        await harness.syncManager.drainPendingQueue()
        let body = try #require(harness.recordedBodies("POST", "/api/foods").first)
        let uploaded = try JSONDecoder().decode(FoodCreate.self, from: body)
        #expect(uploaded.imageUrl == Self.offImage)
        #expect(uploaded.saturatedFat == 0.7)
        #expect(uploaded.sodium == 480)
        #expect(uploaded.categoriesTags == ["en:breads"])
    }

    @Test("The user's own food wins over an Open Food Facts lookup")
    func syncedExistingFoodWins() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.foodRepository
        try harness.context.insert(LocalFood(food: harness.food(id: "f1", name: "Cola", barcode: "123")))
        try harness.context.save()

        guard case let .existing(found) = try await repo.resolveScannedBarcode("123") else {
            Issue.record("expected the existing food")
            return
        }

        #expect(found.id == "f1")
        #expect(harness.recordedRequests.isEmpty)
    }

    @Test("A barcode the server reports as unknown resolves to not found and creates nothing")
    func syncedUnknownBarcodeIsNotFound() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.foodRepository
        harness.stub("GET", "/api/foods", json: #"{"foods": []}"#)
        harness.stub("GET", "/api/openfoodfacts/4000000000001", status: 404, json: #"{"error": "Product not found"}"#)

        #expect(try await repo.resolveScannedBarcode("4000000000001") == .notFound)
        #expect(repo.findLocalByBarcode("4000000000001") == nil)
        #expect(harness.syncManager.queuedRows().isEmpty)
    }

    @Test("A rate limit, a server error or a missing connection throws and creates nothing")
    func syncedFailedLookupThrows() async throws {
        for (barcode, status) in [("4000000000002", 429), ("4000000000003", 500), ("4000000000004", 502)] {
            let harness = try RepositoryHarness()
            let repo = harness.foodRepository
            harness.stub("GET", "/api/foods", json: #"{"foods": []}"#)
            harness.stub("GET", "/api/openfoodfacts/\(barcode)", status: status, json: #"{"error": "nope"}"#)

            do {
                _ = try await repo.resolveScannedBarcode(barcode)
                Issue.record("status \(status) must not resolve")
            } catch let APIError.serverError(code, _) {
                #expect(code == status)
            } catch {
                Issue.record("status \(status) threw \(error)")
            }
            #expect(repo.findLocalByBarcode(barcode) == nil)
            #expect(harness.syncManager.queuedRows().isEmpty)
        }

        let offline = try RepositoryHarness()
        offline.stub("GET", "/api/foods", json: #"{"foods": []}"#)
        offline.stubError("GET", "/api/openfoodfacts/4000000000005", code: .notConnectedToInternet)
        do {
            _ = try await offline.foodRepository.resolveScannedBarcode("4000000000005")
            Issue.record("offline must not resolve")
        } catch {
            #expect(OpenFoodFactsLookupFailure.reason(for: error) == "offline")
        }
    }

    @Test("A failed look-through of the user's own foods is a failure, not an unknown product")
    func syncedOwnFoodsFailureThrows() async throws {
        let harness = try RepositoryHarness()
        harness.stub("GET", "/api/foods", status: 500, json: #"{"error": "boom"}"#)

        await #expect(throws: APIError.self) {
            try await harness.foodRepository.resolveScannedBarcode("4000000000006")
        }
        #expect(harness.recordedRequests == ["GET /api/foods"])
    }

    @Test("Resolving a search hit throws on a failed lookup instead of returning nil")
    func findOrCreateThrowsOnFailure() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.foodRepository
        harness.stub("GET", "/api/foods", json: #"{"foods": []}"#)
        harness.stub("GET", "/api/openfoodfacts/4000000000007", status: 503, json: "{}")
        harness.stub("GET", "/api/openfoodfacts/4000000000008", status: 404, json: "{}")

        await #expect(throws: APIError.self) {
            try await repo.findOrCreateFromOpenFoodFacts(barcode: "4000000000007")
        }
        #expect(try await repo.findOrCreateFromOpenFoodFacts(barcode: "4000000000008") == nil)
    }

    // MARK: - Repository: Local mode

    private func localRepository(_ harness: RepositoryHarness) -> FoodRepository {
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

    private func stubDirect(_ barcode: String, status: Int = 200, json: String, headers: [String: String] = [:]) {
        StubURLProtocol.stub(
            "GET",
            "https://world.openfoodfacts.org/api/v2/product/\(barcode).json",
            status: status,
            json: json,
            headers: headers
        )
    }

    @Test("Local mode imports straight from Open Food Facts with photo and extended nutrients")
    func localImportKeepsPhotoAndNutrients() async throws {
        let harness = try RepositoryHarness(mode: .local)
        let repo = localRepository(harness)
        stubDirect("7610000000101", json: """
        {"status": 1, "product": {
            "product_name": "Crackers", "brands": "Acme", "image_front_url": "\(Self.offImage)",
            "nutriments": {"energy-kcal_100g": 380, "proteins_100g": 9.7, "carbohydrates_100g": 71.4,
                           "fat_100g": 4.5, "fiber_100g": 2, "saturated-fat_100g": 1.1,
                           "sodium_100g": 0.512, "vitamin-b12_100g": 0.0000007}
        }}
        """)

        guard case let .imported(created) = try await repo.resolveScannedBarcode("7610000000101") else {
            Issue.record("expected an imported food")
            return
        }

        #expect(created.name == "Crackers")
        #expect(created.imageUrl == Self.offImage)
        #expect(created.saturatedFat == 1.1)
        #expect(created.sodium == 512)
        #expect(created.vitaminB12 == 0.7)
        #expect(repo.food(id: created.id)?.sodium == 512)
        #expect(harness.syncManager.queuedRows().isEmpty)
    }

    @Test("Local mode reads an unknown product as not found")
    func localUnknownProductIsNotFound() async throws {
        let harness = try RepositoryHarness(mode: .local)
        let repo = localRepository(harness)
        stubDirect("7610000000102", json: #"{"status": 0, "status_verbose": "product not found"}"#)
        stubDirect("7610000000103", status: 404, json: #"{"status": 0}"#)

        #expect(try await repo.resolveScannedBarcode("7610000000102") == .notFound)
        #expect(try await repo.resolveScannedBarcode("7610000000103") == .notFound)
    }

    @Test("Local mode throws when Open Food Facts is down, rate limiting or unreadable")
    func localFailedLookupThrows() async throws {
        let harness = try RepositoryHarness(mode: .local)
        let repo = localRepository(harness)
        stubDirect("7610000000104", status: 429, json: "{}", headers: ["Retry-After": "30"])
        stubDirect("7610000000105", status: 503, json: "{}")
        stubDirect("7610000000106", json: "<html>")
        stubDirect("7610000000107", json: #"{"product": {}}"#)

        await #expect(throws: OpenFoodFactsLookupFailure.unavailable(retryAfter: 30)) {
            try await repo.resolveScannedBarcode("7610000000104")
        }
        await #expect(throws: OpenFoodFactsLookupFailure.unavailable(retryAfter: nil)) {
            try await repo.resolveScannedBarcode("7610000000105")
        }
        await #expect(throws: OpenFoodFactsLookupFailure.unavailable(retryAfter: nil)) {
            try await repo.resolveScannedBarcode("7610000000106")
        }
        await #expect(throws: OpenFoodFactsLookupFailure.invalidResponse) {
            try await repo.resolveScannedBarcode("7610000000107")
        }
        #expect(repo.findLocalByBarcode("7610000000104") == nil)
    }
}
