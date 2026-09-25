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

    @Test("Confidence at the threshold is not weak, just below is")
    func thresholdBoundary() {
        // isWeakEstimate uses a strict `< 0.5`, matching AIMealReviewView's
        // existing "low confidence" row badge — exactly 0.5 doesn't count.
        #expect(!MealEstimator.isWeakEstimate(MealEstimate(items: [makeItem(confidence: 0.5)])))
        #expect(MealEstimator.isWeakEstimate(MealEstimate(items: [makeItem(confidence: 0.49)])))
    }

    // MARK: - preferredEstimate

    @Test("A non-weak cloud retry replaces a weak on-device result")
    func strongCloudWins() {
        let onDevice = MealEstimate(items: [makeItem(confidence: 0.3)])
        let cloud = MealEstimate(items: [makeItem(confidence: 0.8)], source: .privateCloudCompute)
        #expect(MealEstimator.preferredEstimate(onDevice: onDevice, privateCloud: cloud).source == .privateCloudCompute)
    }

    @Test("An empty cloud retry keeps the weak on-device result")
    func emptyCloudLoses() {
        let onDevice = MealEstimate(items: [makeItem(confidence: 0.3)])
        let cloud = MealEstimate(items: [], source: .privateCloudCompute)
        #expect(MealEstimator.preferredEstimate(onDevice: onDevice, privateCloud: cloud).source == .onDevice)
    }

    @Test("A weak cloud retry beats an empty on-device result")
    func weakCloudBeatsEmpty() {
        let onDevice = MealEstimate(items: [])
        let cloud = MealEstimate(items: [makeItem(confidence: 0.2)], source: .privateCloudCompute)
        #expect(MealEstimator.preferredEstimate(onDevice: onDevice, privateCloud: cloud).source == .privateCloudCompute)
    }

    @Test("Both weak: higher mean confidence wins, ties stay on-device")
    func bothWeakCompareConfidence() {
        let onDevice = MealEstimate(items: [makeItem(confidence: 0.25), makeItem(confidence: 0.25)])
        let better = MealEstimate(items: [makeItem(confidence: 0.45)], source: .privateCloudCompute)
        let worse = MealEstimate(items: [makeItem(confidence: 0.1)], source: .privateCloudCompute)
        let tie = MealEstimate(items: [makeItem(confidence: 0.25)], source: .privateCloudCompute)
        func winner(_ cloud: MealEstimate) -> MealEstimateSource {
            MealEstimator.preferredEstimate(onDevice: onDevice, privateCloud: cloud).source
        }
        #expect(winner(better) == .privateCloudCompute)
        #expect(winner(worse) == .onDevice)
        #expect(winner(tie) == .onDevice)
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
