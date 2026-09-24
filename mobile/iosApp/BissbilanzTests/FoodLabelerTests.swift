@testable import Bissbilanz
import Foundation
import Testing

#if canImport(FoundationModels)
import FoundationModels
#endif

/// Coverage for `FoodLabeler`'s prompt builder — pure and available on every
/// platform/compiler, with or without Apple Intelligence, so it's tested
/// directly rather than through a session. The optional on-device evaluation
/// at the bottom mirrors `MealEstimatorEvaluationTests`' skip logic: it only
/// runs when Apple Intelligence is actually available, which GitHub's
/// virtualized macOS runners never report, so it's skipped (not failed) in CI.
@Suite("Food labeller prompt builder")
struct FoodLabelerTests {
    @Test("The prompt includes the food's name, brand and a drink hint for a volume serving unit")
    func promptIncludesFieldsForADrink() {
        let prompt = FoodLabeler.buildPrompt(
            for: FoodLabelInput(name: "Coca-Cola", brand: "Coca-Cola", servingUnit: .ml, ingredientsText: nil),
            vocabulary: ["banana", "bottle"]
        )
        #expect(prompt.contains("Coca-Cola"))
        #expect(prompt.contains("ml"))
        #expect(prompt.contains("drink"))
        #expect(prompt.contains("banana"))
        #expect(prompt.contains("bottle"))
    }

    @Test("A non-volume serving unit gets no drink hint")
    func promptOmitsDrinkHintForSolidFoods() {
        let prompt = FoodLabeler.buildPrompt(
            for: FoodLabelInput(name: "Bread", brand: nil, servingUnit: .g, ingredientsText: nil),
            vocabulary: []
        )
        #expect(!prompt.contains("drink"))
    }

    @Test("Ingredients text is truncated to ~300 characters")
    func promptTruncatesIngredients() {
        let longIngredients = String(repeating: "a", count: 500)
        let prompt = FoodLabeler.buildPrompt(
            for: FoodLabelInput(name: "Mystery Bar", brand: nil, servingUnit: .g, ingredientsText: longIngredients),
            vocabulary: []
        )
        #expect(prompt.contains(String(repeating: "a", count: 300)))
        #expect(!prompt.contains(String(repeating: "a", count: 301)))
    }

    @Test("An empty vocabulary produces no reuse-vocabulary line")
    func promptOmitsEmptyVocabulary() {
        let prompt = FoodLabeler.buildPrompt(
            for: FoodLabelInput(name: "Egg", brand: nil, servingUnit: .g, ingredientsText: nil),
            vocabulary: []
        )
        #expect(!prompt.lowercased().contains("already used"))
    }

    @Test("No brand line when the food has none")
    func promptOmitsMissingBrand() {
        let prompt = FoodLabeler.buildPrompt(
            for: FoodLabelInput(name: "Egg", brand: nil, servingUnit: .g, ingredientsText: nil),
            vocabulary: []
        )
        #expect(!prompt.contains("Brand:"))
    }

    // MARK: - Optional on-device evaluation

    #if canImport(FoundationModels)

    @available(iOS 26.0, *)
    private static var modelAvailable: Bool {
        SystemLanguageModel.default.availability == .available
    }

    @Test(
        "FoodLabeler suggests plausible labels for a couple of real foods",
        .enabled(if: Self.modelAvailable, "Apple Intelligence is not available on this runner")
    )
    @available(iOS 26.0, *)
    @MainActor
    func evaluatedOnDevice() async throws {
        let harness = try RepositoryHarness()
        let labeler = FoodLabeler(foodRepository: harness.foodRepository)

        let banana = try await labeler.labels(for: FoodLabelInput(
            name: "Banane (roh)", brand: nil, servingUnit: .g, ingredientsText: nil
        ))
        #expect(banana.contains("banana"))

        let cola = try await labeler.labels(for: FoodLabelInput(
            name: "Coca-Cola 0.33l can", brand: "Coca-Cola", servingUnit: .ml, ingredientsText: nil
        ))
        #expect(cola.contains("can") || cola.contains("cola"))
    }

    #endif
}
