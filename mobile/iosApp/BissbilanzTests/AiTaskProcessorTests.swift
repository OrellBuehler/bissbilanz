@testable import Bissbilanz
import Foundation
import Testing

/// `AiTaskProcessor`'s actual pipeline needs a live Foundation Models session
/// (unavailable in CI, see `MealEstimatorEvaluationTests`), so these cover
/// only its pure, synchronous helpers — URL extraction, the label-validity
/// gate it shares with `NutritionLabelValidatorTests`, and result summary
/// formatting — the same split `NutritionLabelValidatorTests` documents.
@Suite("AI task processor")
struct AiTaskProcessorTests {
    // MARK: - Link extraction

    @Test("Finds an http(s) URL in a free-text description")
    func extractsSingleUrl() {
        let urls = AiTaskLinkExtractor.urls(in: "Had this: https://example.com/product/123 - really good")
        #expect(urls.map(\.absoluteString) == ["https://example.com/product/123"])
    }

    @Test("Finds every URL, in the order they appear, and skips non-http schemes")
    func extractsMultipleUrlsInOrder() {
        let text = "See mailto:me@example.com then https://a.example.com and https://b.example.com/x?y=1"
        let urls = AiTaskLinkExtractor.urls(in: text)
        #expect(urls.map(\.absoluteString) == ["https://a.example.com", "https://b.example.com/x?y=1"])
    }

    @Test("Returns nothing for plain text with no link")
    func noUrlsInPlainText() {
        #expect(AiTaskLinkExtractor.urls(in: "just a bowl of pasta with tomato sauce").isEmpty)
    }

    @Test("Strips tags and script/style blocks, decodes entities, collapses whitespace")
    func stripsHtmlToPlainText() {
        let html = """
        <html><head><style>.x{color:red}</style></head><body>
        <script>track();</script>
        <h1>Greek Yogurt &amp; Honey</h1>
        <p>Per 100g:   375&nbsp;kcal</p>
        </body></html>
        """
        let text = AiTaskLinkExtractor.plainText(fromHTML: html)
        #expect(text == "Greek Yogurt & Honey Per 100g: 375 kcal")
    }

    @Test("Truncates to the requested length")
    func truncatesLongText() {
        let html = String(repeating: "a", count: 100)
        #expect(AiTaskLinkExtractor.plainText(fromHTML: html, maxLength: 10).count == 10)
    }

    // MARK: - Label-validity gate (also exercised via NutritionLabelValidator directly)

    @Test("A coherent reading with calories and two macros is a valid label")
    func validLabelWithCaloriesAndTwoMacros() {
        let nutrition = ParsedNutrition(calories: 375, protein: 9.7, carbs: 71.4, fat: 4.5)
        #expect(NutritionLabelValidator.isValidLabel(nutrition))
    }

    @Test("No calories at all is never a valid label")
    func noCaloriesIsInvalid() {
        let nutrition = ParsedNutrition(protein: 9.7, carbs: 71.4, fat: 4.5)
        #expect(!NutritionLabelValidator.isValidLabel(nutrition))
    }

    @Test("Calories plus only one macro is too weak a reading")
    func oneCoreMacroIsInvalid() {
        let nutrition = ParsedNutrition(calories: 375, protein: 9.7)
        #expect(!NutritionLabelValidator.isValidLabel(nutrition))
    }

    @Test("Energy wildly inconsistent with the macros is not a valid label")
    func incoherentEnergyIsInvalid() {
        let nutrition = ParsedNutrition(calories: 900, protein: 10, carbs: 10, fat: 10)
        #expect(!NutritionLabelValidator.isValidLabel(nutrition))
    }

    // MARK: - Summary formatting

    @Test("Summarizes item names and rounds the total calories")
    func summarizesItems() {
        let savedLocale = L10n.currentLocale
        L10n.currentLocale = .en
        defer { L10n.currentLocale = savedLocale }

        let items = [
            MealEstimateItem(
                name: "egg", matchedFoodId: nil, quantityDescription: "2 eggs", grams: nil, servings: nil,
                calories: 150, protein: 12, carbs: 1, fat: 10, fiber: 0, confidence: 0.9
            ),
            MealEstimateItem(
                name: "toast", matchedFoodId: nil, quantityDescription: "1 slice", grams: nil, servings: nil,
                calories: 80.4, protein: 3, carbs: 15, fat: 1, fiber: 1, confidence: 0.8
            ),
        ]
        let summary = AiTaskProcessor.summarize(items: items)
        #expect(summary.contains("egg, toast"))
        #expect(summary.contains("230"))
    }

    @Test("Empty description falls back to a generic product name")
    func productNameFallsBack() {
        let savedLocale = L10n.currentLocale
        L10n.currentLocale = .en
        defer { L10n.currentLocale = savedLocale }
        #expect(AiTaskProcessor.productName(fromDescription: nil) == L10n.aiTaskProcessorScannedProductName)
        #expect(AiTaskProcessor.productName(fromDescription: "   ") == L10n.aiTaskProcessorScannedProductName)
    }

    @Test("A non-empty description becomes the product name, trimmed and capped")
    func productNameFromDescription() {
        #expect(AiTaskProcessor.productName(fromDescription: "  the yogurt  ") == "the yogurt")
        let long = String(repeating: "x", count: 100)
        #expect(AiTaskProcessor.productName(fromDescription: long).count == 60)
    }

    // MARK: - processedBy

    @Test("Maps the estimate source to the server's processedBy values")
    func processedByMapping() {
        #expect(AiTaskProcessor.processedBy(for: .onDevice) == "on_device")
        #expect(AiTaskProcessor.processedBy(for: .privateCloudCompute) == "private_cloud")
    }

    // MARK: - Pending food key

    @Test("A generated pending food key is recognized as one; a real food id is not")
    func pendingFoodKeyRoundTrips() {
        let key = AiTaskProcessor.pendingFoodKey()
        #expect(AiTaskProcessor.isPendingFoodKey(key))
        #expect(!AiTaskProcessor.isPendingFoodKey("a-real-food-id"))
        #expect(!AiTaskProcessor.isPendingFoodKey(nil))
    }

    // MARK: - Building a FoodCreate from a scanned label

    @Test("Builds a per-100 FoodCreate from parsed label nutrition, carrying the barcode")
    func buildsFoodCreateFromLabel() {
        let nutrition = ParsedNutrition(calories: 375, protein: 9.7, carbs: 71.4, fat: 4.5, fiber: 2)
        let create = AiTaskProcessor.foodCreate(from: nutrition, name: "Muesli", barcode: "4006381333931")
        #expect(create.name == "Muesli")
        #expect(create.servingSize == 100)
        #expect(create.servingUnit == .g)
        #expect(create.calories == 375)
        #expect(create.barcode == "4006381333931")
    }

    @Test("A per-100ml (volume) reading becomes a milliliter serving unit")
    func buildsFoodCreateWithVolumeUnit() {
        let nutrition = ParsedNutrition(calories: 42, protein: 0, carbs: 10, fat: 0, isVolume: true)
        let create = AiTaskProcessor.foodCreate(from: nutrition, name: "Soda")
        #expect(create.servingUnit == .ml)
    }

    // MARK: - Content matching (the freshness check `completeAiTask`'s LWW guard relies on)

    private static func task(
        description: String? = "the yogurt",
        photoUrls: [String] = [],
        date: String = "2026-06-01",
        mealType: String? = "lunch",
        eatenAt: String? = nil,
        updatedAt: String? = "2026-06-01T08:00:00Z"
    ) -> AiTask {
        AiTask(
            id: "task-1", userId: "u1", status: "pending", description: description, photoUrl: nil,
            photoUrls: photoUrls, date: date, mealType: mealType, eatenAt: eatenAt, source: nil,
            resultSummary: nil, createdEntryIds: nil, completedAt: nil, dismissedAt: nil, acknowledgedAt: nil,
            processedBy: nil, createdAt: nil, updatedAt: updatedAt
        )
    }

    @Test("Identical description/photos/date/meal/time match regardless of updatedAt")
    func matchesIgnoresUpdatedAt() {
        let a = Self.task(updatedAt: "2026-06-01T08:00:00Z")
        let b = Self.task(updatedAt: "2026-06-01T09:30:00Z")
        #expect(AiTaskProcessor.matches(a, b))
    }

    @Test("A changed description, photo set, date, meal type or eaten-at time each break the match")
    func matchesDetectsEveryEditedField() {
        let base = Self.task()
        #expect(!AiTaskProcessor.matches(base, Self.task(description: "something else")))
        #expect(!AiTaskProcessor.matches(base, Self.task(photoUrls: ["p1"])))
        #expect(!AiTaskProcessor.matches(base, Self.task(date: "2026-06-02")))
        #expect(!AiTaskProcessor.matches(base, Self.task(mealType: "dinner")))
        #expect(!AiTaskProcessor.matches(base, Self.task(eatenAt: "2026-06-01T12:00:00Z")))
    }

    // MARK: - Barcode lookup failures

    @Test("An unreadable product and a refused request are permanent")
    func barcodeLookupPermanentFailures() {
        let corrupted = DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "broken"))
        let permanent: [Error] = [
            OpenFoodFactsLookupFailure.invalidResponse,
            APIError.decodingError(corrupted, statusCode: 200, body: nil),
            APIError.badRequest(nil),
            APIError.notFound,
            APIError.gone,
            APIError.conflict(serverNewer: false, body: nil),
            APIError.serverError(404, nil),
            APIError.serverError(422, nil),
        ]
        for error in permanent {
            #expect(AiTaskProcessor.barcodeLookupFailureKind(error) == .permanent, "\(error)")
        }
    }

    @Test("A missing connection, a timeout, a rate limit and a server error are transient")
    func barcodeLookupTransientFailures() {
        let transient: [Error] = [
            OpenFoodFactsLookupFailure.unavailable(retryAfter: nil),
            OpenFoodFactsLookupFailure.unavailable(retryAfter: 30),
            APIError.networkError(URLError(.notConnectedToInternet)),
            APIError.networkError(URLError(.timedOut)),
            APIError.serverError(408, nil),
            APIError.serverError(429, nil),
            APIError.serverError(500, nil),
            APIError.serverError(503, nil),
            APIError.unauthorized,
            APIError.updateRequired(minVersion: "9.9.9"),
            URLError(.timedOut),
        ]
        for error in transient {
            #expect(AiTaskProcessor.barcodeLookupFailureKind(error) == .transient, "\(error)")
        }
    }

    @Test("A cancellation is never read as a lookup failure")
    func barcodeLookupCancellation() {
        #expect(AiTaskProcessor.barcodeLookupFailureKind(CancellationError()) == .cancelled)
        #expect(AiTaskProcessor.barcodeLookupFailureKind(URLError(.cancelled)) == .cancelled)
        #expect(AiTaskProcessor.barcodeLookupFailureKind(APIError.networkError(URLError(.cancelled))) == .cancelled)
    }
}

@Suite("AI task barcode resolution")
@MainActor
struct AiTaskBarcodeResolutionTests {
    private func resolve(_ harness: RepositoryHarness, _ barcode: String) async throws -> Food? {
        try await AiTaskProcessor.resolveBarcode(barcode, taskId: "task-1", foodRepository: harness.foodRepository)
    }

    @Test("The user's own food is used without asking Open Food Facts")
    func ownFoodWins() async throws {
        let harness = try RepositoryHarness()
        try harness.context.insert(LocalFood(food: harness.food(id: "f1", name: "Cola", barcode: "5000000000001")))
        try harness.context.save()

        let food = try await resolve(harness, "5000000000001")

        #expect(food?.id == "f1")
        #expect(harness.recordedRequests.isEmpty)
    }

    @Test("A product Open Food Facts knows is created, photo and nutrients included")
    func knownProductIsCreated() async throws {
        let harness = try RepositoryHarness()
        harness.stub("GET", "/api/foods", json: #"{"foods": []}"#)
        harness.stub("GET", "/api/openfoodfacts/5000000000002", json: """
        {"product": {
            "name": "Oat Drink", "servingSize": 100, "servingUnit": "ml",
            "calories": 45, "protein": 1, "carbs": 6.5, "fat": 1.5, "fiber": 0.8,
            "imageUrl": "https://images.openfoodfacts.org/images/products/500/000/000/0002/front.jpg",
            "calcium": 120
        }}
        """)

        let food = try #require(try await resolve(harness, "5000000000002"))

        #expect(food.name == "Oat Drink")
        #expect(food.barcode == "5000000000002")
        #expect(food.calcium == 120)
        #expect(food.imageUrl == "https://images.openfoodfacts.org/images/products/500/000/000/0002/front.jpg")
    }

    @Test("A barcode Open Food Facts does not know resolves to nothing")
    func unknownBarcodeResolvesToNil() async throws {
        let harness = try RepositoryHarness()
        harness.stub("GET", "/api/foods", json: #"{"foods": []}"#)
        harness.stub("GET", "/api/openfoodfacts/5000000000003", status: 404, json: #"{"error": "Product not found"}"#)

        #expect(try await resolve(harness, "5000000000003") == nil)
        #expect(harness.syncManager.queuedRows().isEmpty)
    }

    @Test("An unreadable product falls back to nothing, so the label and meal passes still run")
    func unreadableProductFallsBack() async throws {
        let harness = try RepositoryHarness()
        harness.stub("GET", "/api/foods", json: #"{"foods": []}"#)
        harness.stub("GET", "/api/openfoodfacts/5000000000004", json: #"{"product": {"name": 5}}"#)

        #expect(try await resolve(harness, "5000000000004") == nil)
        #expect(harness.syncManager.queuedRows().isEmpty)
    }

    @Test("A rate limit, a server error or a missing connection to Open Food Facts falls back to nothing")
    func unavailableLookupFallsBack() async throws {
        let harness = try RepositoryHarness()
        harness.stub("GET", "/api/foods", json: #"{"foods": []}"#)
        harness.stub("GET", "/api/openfoodfacts/5000000000005", status: 429, json: "{}")
        harness.stub("GET", "/api/openfoodfacts/5000000000006", status: 503, json: "{}")
        harness.stubError("GET", "/api/openfoodfacts/5000000000007", code: .notConnectedToInternet)

        #expect(try await resolve(harness, "5000000000005") == nil)
        #expect(try await resolve(harness, "5000000000006") == nil)
        #expect(try await resolve(harness, "5000000000007") == nil)
        #expect(harness.syncManager.queuedRows().isEmpty)
    }

    @Test("A failed look through the user's own foods still leaves the task pending")
    func ownFoodsFailureStillThrows() async throws {
        let harness = try RepositoryHarness()
        harness.stub("GET", "/api/foods", status: 500, json: #"{"error": "boom"}"#)
        harness.stubError("GET", "/api/openfoodfacts/5000000000008", code: .notConnectedToInternet)

        await #expect(throws: APIError.self) {
            try await resolve(harness, "5000000000008")
        }
        #expect(harness.recordedRequests == ["GET /api/foods"])
    }

    @Test("A cancelled lookup is rethrown instead of being read as nothing")
    func cancelledLookupIsRethrown() async throws {
        let harness = try RepositoryHarness()
        harness.stub("GET", "/api/foods", json: #"{"foods": []}"#)
        harness.stubError("GET", "/api/openfoodfacts/5000000000009", code: .cancelled)

        do {
            _ = try await resolve(harness, "5000000000009")
            Issue.record("a cancelled lookup must not resolve")
        } catch {
            #expect(AiTaskProcessor.barcodeLookupFailureKind(error) == .cancelled)
        }
    }
}
