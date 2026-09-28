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
}
