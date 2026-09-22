@testable import Bissbilanz
import Foundation
import Testing

#if compiler(>=6.4)
import Evaluations
import FoundationModels
#endif

/// Coverage for `MealEstimator`'s text-estimation path, in two tiers:
///
/// - The deterministic tests below (hallucination guard, result mapping,
///   tolerance scoring, fixture sanity) use plain values and always run in
///   CI, on every platform/compiler, with or without Apple Intelligence.
/// - `evaluated()` exercises the real, on-device Foundation Models session
///   via `MealEstimationEvaluation` and the Evaluations framework (iOS
///   27.0+, WWDC26 — see that file's header comment for the version fence).
///   GitHub's macOS runners are virtualized and have no Apple Intelligence —
///   `SystemLanguageModel.default.availability` reports `.unavailable` there
///   — so that test is `.enabled(if:)` the model actually being `.available`,
///   which Swift Testing reports as *skipped*, not failed, in CI.
///
/// Run the real evaluation locally on a Mac signed into Apple Intelligence
/// with `scripts/ios/run-meal-estimator-evals.sh` (an `xcodebuild test
/// -only-testing:BissbilanzTests/MealEstimatorEvaluationTests/evaluated`
/// invocation) — open the resulting `.xcresult` in Xcode and select
/// "Evaluations" in the Report navigator for the per-sample breakdown.
@Suite
struct MealEstimatorEvaluationTests {
    // MARK: - Fixture data sanity

    @Test("The eval fixture set has 20-30 cases with no duplicate descriptions")
    func fixtureCaseCount() {
        #expect((20 ... 30).contains(MealEvalFixtures.cases.count))
        #expect(Set(MealEvalFixtures.cases.map(\.description)).count == MealEvalFixtures.cases.count)
    }

    @Test("Every expected matched food id is a real seed food")
    func fixtureExpectedIdsAreSeeded() {
        let knownIds = Set(MealEvalFixtures.seedFoods.map(\.id))
        for testCase in MealEvalFixtures.cases {
            #expect(testCase.expectedMatchedFoodIds.isSubset(of: knownIds))
        }
    }

    @Test("Seed food ids are unique")
    func fixtureSeedFoodIdsAreUnique() {
        let ids = MealEvalFixtures.seedFoods.map(\.id)
        #expect(Set(ids).count == ids.count)
    }

    // MARK: - Hallucination guard / result mapping

    @Test("A matchedFoodId the tool actually returned is kept, with its servings")
    func hallucinationGuardKeepsValidMatch() {
        let item = MealEstimateItem.fromGenerated(
            name: "Banana", matchedFoodId: "food-1", quantityDescription: "1 banana",
            grams: 118, servings: 1, calories: 105, protein: 1, carbs: 27, fat: 0, fiber: 3, confidence: 0.9,
            validMatchedFoodIds: ["food-1", "food-2"]
        )
        #expect(item.matchedFoodId == "food-1")
        #expect(item.servings == 1)
    }

    @Test("A matchedFoodId the tool never returned is dropped, along with its servings")
    func hallucinationGuardDropsInventedMatch() {
        let item = MealEstimateItem.fromGenerated(
            name: "Banana", matchedFoodId: "invented-id", quantityDescription: "1 banana",
            grams: 118, servings: 1, calories: 105, protein: 1, carbs: 27, fat: 0, fiber: 3, confidence: 0.9,
            validMatchedFoodIds: ["food-1", "food-2"]
        )
        #expect(item.matchedFoodId == nil)
        #expect(item.servings == nil)
    }

    @Test("A nil matchedFoodId passes through untouched")
    func hallucinationGuardPassesThroughNoMatch() {
        let item = MealEstimateItem.fromGenerated(
            name: "Mystery Soup", matchedFoodId: nil, quantityDescription: "1 bowl",
            grams: 300, servings: nil, calories: 220, protein: 8, carbs: 30, fat: 6, fiber: 2, confidence: 0.4,
            validMatchedFoodIds: ["food-1"]
        )
        #expect(item.matchedFoodId == nil)
        #expect(item.calories == 220)
    }

    // MARK: - Tolerance scoring

    private static let sampleFixture = MealEvalFixtures.Case(
        description: "test", calorieRange: 100 ... 200, proteinRange: 5 ... 15,
        carbsRange: 10 ... 30, fatRange: 0 ... 10, expectedMatchedFoodIds: ["food-1"]
    )

    @Test("A well-formed estimate scores as passing on every dimension")
    func scorerPassesAGoodEstimate() {
        let estimate = MealEstimate(items: [
            MealEstimateItem(
                name: "Item", matchedFoodId: "food-1", quantityDescription: "1", grams: 100, servings: 1,
                calories: 150, protein: 10, carbs: 20, fat: 5, fiber: 2, confidence: 0.9
            ),
        ])
        let score = MealEstimationScorer.score(estimate, against: Self.sampleFixture, knownFoodIds: ["food-1", "food-2"])
        #expect(score.passed)
    }

    @Test("Calories outside the expected range fail only that dimension")
    func scorerFlagsCaloriesOutOfRange() {
        let fixture = MealEvalFixtures.Case(
            description: "test", calorieRange: 100 ... 200, proteinRange: 0 ... 100,
            carbsRange: 0 ... 100, fatRange: 0 ... 100, expectedMatchedFoodIds: []
        )
        let estimate = MealEstimate(items: [
            MealEstimateItem(
                name: "Item", matchedFoodId: nil, quantityDescription: "1", grams: nil, servings: nil,
                calories: 900, protein: 10, carbs: 20, fat: 5, fiber: 2, confidence: 0.9
            ),
        ])
        let score = MealEstimationScorer.score(estimate, against: fixture, knownFoodIds: [])
        #expect(!score.caloriesInRange)
        #expect(score.proteinInRange)
        #expect(!score.passed)
    }

    @Test("A matched id outside the known food database fails the hallucination check")
    func scorerFlagsUnknownMatchedId() {
        let fixture = MealEvalFixtures.Case(
            description: "test", calorieRange: 0 ... 1000, proteinRange: 0 ... 1000,
            carbsRange: 0 ... 1000, fatRange: 0 ... 1000, expectedMatchedFoodIds: []
        )
        let estimate = MealEstimate(items: [
            MealEstimateItem(
                name: "Item", matchedFoodId: "not-a-real-food", quantityDescription: "1", grams: nil, servings: 1,
                calories: 100, protein: 1, carbs: 1, fat: 1, fiber: 1, confidence: 0.9
            ),
        ])
        let score = MealEstimationScorer.score(estimate, against: fixture, knownFoodIds: ["food-1"])
        #expect(!score.noHallucinatedIds)
        #expect(!score.passed)
    }

    @Test("A missing expected match fails expectedIdsMatched")
    func scorerFlagsMissingExpectedMatch() {
        let estimate = MealEstimate(items: [
            MealEstimateItem(
                name: "Item", matchedFoodId: nil, quantityDescription: "1", grams: nil, servings: nil,
                calories: 100, protein: 1, carbs: 1, fat: 1, fiber: 1, confidence: 0.9
            ),
        ])
        let score = MealEstimationScorer.score(estimate, against: Self.sampleFixture, knownFoodIds: ["food-1"])
        #expect(!score.expectedIdsMatched)
        #expect(!score.passed)
    }

    @Test("An estimate with no items never passes")
    func scorerFlagsEmptyEstimate() {
        let fixture = MealEvalFixtures.Case(
            description: "test", calorieRange: 0 ... 1000, proteinRange: 0 ... 1000,
            carbsRange: 0 ... 1000, fatRange: 0 ... 1000, expectedMatchedFoodIds: []
        )
        let score = MealEstimationScorer.score(MealEstimate(items: []), against: fixture, knownFoodIds: [])
        #expect(!score.producedItems)
        #expect(!score.passed)
    }

    // MARK: - The real, on-device evaluation

    #if compiler(>=6.4)

    @available(iOS 27, *)
    private static var modelAvailable: Bool {
        SystemLanguageModel.default.availability == .available
    }

    @available(iOS 27, *)
    static let evaluation = MealEstimationEvaluation()

    @Test(
        "MealEstimator's text path scores well against the eval fixture set",
        .enabled(if: Self.modelAvailable, "Apple Intelligence is not available on this runner"),
        .evaluates(Self.evaluation)
    )
    @available(iOS 27, *)
    func evaluated() throws {
        let result = EvaluationContext.current.result
        #expect(result.aggregateValue(.mean(of: Self.evaluation.caloriesInRange)) >= 0.7)
        #expect(result.aggregateValue(.mean(of: Self.evaluation.proteinInRange)) >= 0.6)
        #expect(result.aggregateValue(.mean(of: Self.evaluation.carbsInRange)) >= 0.6)
        #expect(result.aggregateValue(.mean(of: Self.evaluation.fatInRange)) >= 0.6)
        #expect(result.aggregateValue(.mean(of: Self.evaluation.expectedIdsMatched)) >= 0.6)
        #expect(result.aggregateValue(.mean(of: Self.evaluation.noHallucinatedIds)) == 1.0)
    }

    #endif
}
