@testable import Bissbilanz
import Foundation

/// Scores one `MealEstimate` against one `MealEvalFixtures.Case`. Plain
/// Swift, free of `FoundationModels`/`Evaluations` types, so it runs
/// everywhere and is unit-tested directly (`MealEstimatorEvaluationTests`)
/// regardless of Apple Intelligence availability — the same logic backs the
/// real (iOS 27-gated, on-device-only) `MealEstimationEvaluation`'s
/// evaluators, so those deterministic tests are real regression coverage for
/// it too.
struct MealEstimationScore {
    let caloriesInRange: Bool
    let proteinInRange: Bool
    let carbsInRange: Bool
    let fatInRange: Bool
    /// True when every id the fixture expects to be matched was matched by
    /// *some* item — order and exact item-to-id pairing don't matter, since a
    /// language model may split or group items differently than the fixture
    /// author did.
    let expectedIdsMatched: Bool
    /// True when no item's `matchedFoodId` falls outside the known seed
    /// database. `MealEstimateItem.fromGenerated`'s own hallucination guard
    /// should make this unconditionally true — this is what would catch a
    /// regression in that guard.
    let noHallucinatedIds: Bool
    /// True when the estimate produced at least one item — an empty result
    /// (not a thrown error, which the harness surfaces separately) is still a
    /// failed estimate.
    let producedItems: Bool

    var passed: Bool {
        caloriesInRange && proteinInRange && carbsInRange && fatInRange
            && expectedIdsMatched && noHallucinatedIds && producedItems
    }
}

enum MealEstimationScorer {
    static func score(
        _ estimate: MealEstimate,
        against fixture: MealEvalFixtures.Case,
        knownFoodIds: Set<String>
    ) -> MealEstimationScore {
        let totalCalories = estimate.items.reduce(0.0) { $0 + ($1.calories ?? 0) }
        let totalProtein = estimate.items.reduce(0.0) { $0 + ($1.protein ?? 0) }
        let totalCarbs = estimate.items.reduce(0.0) { $0 + ($1.carbs ?? 0) }
        let totalFat = estimate.items.reduce(0.0) { $0 + ($1.fat ?? 0) }
        let matchedIds = Set(estimate.items.compactMap(\.matchedFoodId))
        return MealEstimationScore(
            caloriesInRange: fixture.calorieRange.contains(totalCalories),
            proteinInRange: fixture.proteinRange.contains(totalProtein),
            carbsInRange: fixture.carbsRange.contains(totalCarbs),
            fatInRange: fixture.fatRange.contains(totalFat),
            expectedIdsMatched: fixture.expectedMatchedFoodIds.isSubset(of: matchedIds),
            noHallucinatedIds: matchedIds.isSubset(of: knownFoodIds),
            producedItems: !estimate.items.isEmpty
        )
    }
}
