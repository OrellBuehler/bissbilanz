@testable import Bissbilanz
import Foundation
import Testing

#if canImport(FoundationModels)
import FoundationModels
#endif

/// How `MealEstimator.estimatorError(for:)` classifies what a model call
/// throws. The context overflow in BISSBILANZ-4J reached the app as an iOS 27
/// `LanguageModelError`, which the old `GenerationError`-only mapping turned
/// into a generic failure.
@Suite("Meal estimator error classification")
struct MealEstimatorErrorTests {
    /// The message from the production event, with the narrow no-break spaces
    /// the framework groups the numbers with.
    private static let overflowMessage = "Provided 4\u{202F}484 tokens, but the maximum allowed is 4\u{202F}096."

    private static func error(_ message: String) -> NSError {
        NSError(domain: "MealEstimatorErrorTests", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }

    @Test("The production overflow message reads as a context overflow")
    func overflowMessageIsRecognised() {
        #expect(MealEstimator.isContextOverflowMessage(Self.overflowMessage))
        #expect(MealEstimator.isContextOverflowMessage("Provided 4,484 tokens, but the maximum allowed is 4,096."))
        #expect(MealEstimator.isContextOverflowMessage("Exceeded the model's context window of 4096 tokens"))
    }

    @Test("Unrelated failures are not taken for an overflow")
    func otherMessagesAreNotOverflows() {
        #expect(!MealEstimator.isContextOverflowMessage("boom"))
        #expect(!MealEstimator.isContextOverflowMessage("The model is rate limited, try again later."))
        #expect(!MealEstimator.isContextOverflowMessage("The maximum allowed number of requests was reached."))
        #expect(!MealEstimator.isContextOverflowMessage("Your token expired."))
    }

    @Test("An overflow carried by an unknown error type is classified as a context overflow")
    func untypedOverflowIsClassified() {
        let classified = MealEstimator.estimatorError(for: Self.error(Self.overflowMessage))
        #expect(classified.telemetryReason == "context_window_exceeded")
        #expect(MealEstimator.isRetryableOnPrivateCloud(classified))
        #expect(classified.localizedMessage == L10n.aiMealContextWindowError)
    }

    @Test("Any other unknown error stays a generic failure with its message")
    func untypedFailureStaysGeneric() {
        let classified = MealEstimator.estimatorError(for: Self.error("boom"))
        #expect(classified.telemetryReason == "generation_failed: boom")
        #expect(!MealEstimator.isRetryableOnPrivateCloud(classified))
    }

    #if canImport(FoundationModels)
    @Test("A GenerationError overflow is classified as a context overflow")
    func generationErrorOverflowIsClassified() {
        guard #available(iOS 26.0, *) else { return }
        let error = LanguageModelSession.GenerationError.exceededContextWindowSize(
            .init(debugDescription: "context window exceeded")
        )
        #expect(MealEstimator.estimatorError(for: error).telemetryReason == "context_window_exceeded")
    }
    #endif

    #if compiler(>=6.4) && canImport(FoundationModels)
    @Test("An iOS 27 LanguageModelError overflow is classified as a context overflow")
    func languageModelErrorOverflowIsClassified() {
        guard #available(iOS 27, *) else { return }
        let error = LanguageModelError.contextSizeExceeded(
            .init(contextSize: 4096, tokenCount: 4484, debugDescription: Self.overflowMessage)
        )
        #expect(MealEstimator.estimatorError(for: error).telemetryReason == "context_window_exceeded")
    }
    #endif
}
