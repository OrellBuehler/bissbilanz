@testable import Bissbilanz
import Foundation
import Testing

@Suite("Meal estimator Private Cloud Compute fallback policy")
struct MealEstimatorPrivateCloudTests {
    // MARK: - isWeakEstimate

    @Test("Empty items is weak")
    func emptyIsWeak() {
        #expect(MealEstimator.isWeakEstimate(MealEstimate(items: [])))
    }

    @Test("All-low-confidence items is weak")
    func allLowConfidenceIsWeak() {
        let estimate = MealEstimate(items: [
            makeItem(confidence: 0.4),
            makeItem(confidence: 0.1),
        ])
        #expect(MealEstimator.isWeakEstimate(estimate))
    }

    @Test("One confident item is not weak")
    func oneConfidentItemIsNotWeak() {
        let estimate = MealEstimate(items: [
            makeItem(confidence: 0.2),
            makeItem(confidence: 0.9),
        ])
        #expect(!MealEstimator.isWeakEstimate(estimate))
    }

    @Test("Exactly-threshold confidence is weak, just above is not")
    func thresholdBoundary() {
        #expect(MealEstimator.isWeakEstimate(MealEstimate(items: [makeItem(confidence: 0.5)])))
        #expect(!MealEstimator.isWeakEstimate(MealEstimate(items: [makeItem(confidence: 0.51)])))
    }

    // MARK: - isRetryableOnPrivateCloud

    @Test("Guardrail violation and context overflow are retryable")
    func retryableErrors() {
        #expect(MealEstimator.isRetryableOnPrivateCloud(MealEstimatorError.guardrailViolation))
        #expect(MealEstimator.isRetryableOnPrivateCloud(MealEstimatorError.contextWindowExceeded))
    }

    @Test("Unsupported language and generic failures are not retryable")
    func nonRetryableErrors() {
        #expect(!MealEstimator.isRetryableOnPrivateCloud(MealEstimatorError.unsupportedLanguage))
        #expect(!MealEstimator.isRetryableOnPrivateCloud(MealEstimatorError.generationFailed("boom")))
    }

    @Test("A non-MealEstimatorError is not retryable")
    func foreignErrorIsNotRetryable() {
        struct OtherError: Error {}
        #expect(!MealEstimator.isRetryableOnPrivateCloud(OtherError()))
    }

    private func makeItem(confidence: Double) -> MealEstimateItem {
        MealEstimateItem(
            name: "Test item",
            matchedFoodId: nil,
            quantityDescription: "1 serving",
            grams: nil,
            servings: nil,
            calories: 100,
            protein: nil,
            carbs: nil,
            fat: nil,
            fiber: nil,
            confidence: confidence
        )
    }
}
