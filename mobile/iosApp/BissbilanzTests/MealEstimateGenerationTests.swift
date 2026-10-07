@testable import Bissbilanz
import Foundation
import Testing

/// The retry policy around a model call, driven with fake generators so it
/// never needs (or waits for) a live language model.
@Suite("Meal estimate generation retries")
@MainActor
struct MealEstimateGenerationTests {
    private typealias Fixtures = MealEstimateValidatorTests

    private static func estimate(_ items: MealEstimateItem...) -> MealEstimate {
        MealEstimate(items: items)
    }

    private static let burritoDescription = "burrito bowl with rice, black beans and chicken"

    private static var burritoBowlWithIngredients: MealEstimate {
        estimate(
            Fixtures.food("Burrito bowl", grams: 450, protein: 30, carbs: 70, fat: 15),
            Fixtures.food("Rice", grams: 150, protein: 4, carbs: 42, fat: 1),
            Fixtures.food("Black beans", grams: 100, protein: 8, carbs: 20, fat: 1),
            Fixtures.food("Chicken", grams: 120, protein: 36, carbs: 0, fat: 4)
        )
    }

    private static var ingredientsOnly: MealEstimate {
        estimate(
            Fixtures.food("Rice", grams: 150, protein: 4, carbs: 42, fat: 1),
            Fixtures.food("Black beans", grams: 100, protein: 8, carbs: 20, fat: 1),
            Fixtures.food("Chicken", grams: 120, protein: 36, carbs: 0, fat: 4)
        )
    }

    // MARK: - Plausible answers

    @Test("A plausible first answer is returned after a single model call")
    func plausibleFirstAnswer() async throws {
        var attempts: [MealEstimateAttempt] = []
        let result = try await MealEstimateGeneration.run(description: "240g 7% ground beef") { attempt in
            attempts.append(attempt)
            return Self.estimate(Fixtures.realisticBeef)
        }
        #expect(attempts == [.first])
        #expect(result.items.count == 1)
        #expect(!result.items[0].hasBlockingWarning)
    }

    @Test("Calories that only disagree with the macros are fixed without another model call")
    func reconciledCaloriesNeedNoRetry() async throws {
        var calls = 0
        let result = try await MealEstimateGeneration.run(description: "150g chicken") { _ in
            calls += 1
            return Self.estimate(Fixtures.item("Chicken", grams: 150, calories: 600, protein: 45, carbs: 0, fat: 5))
        }
        #expect(calls == 1)
        #expect(result.items[0].calories == 225)
    }

    // MARK: - Implausible answers

    @Test("An impossible answer is retried once with a hint naming the problem, and the better answer wins")
    func implausibleAnswerGetsOneCorrectiveRetry() async throws {
        var hints: [String?] = []
        let result = try await MealEstimateGeneration.run(description: "240g 7% ground beef") { attempt in
            hints.append(attempt.hint)
            return Self.estimate(hints.count == 1 ? Fixtures.impossibleBeef : Fixtures.realisticBeef)
        }
        #expect(hints.count == 2)
        #expect(hints[0] == nil)
        #expect(hints[1]?.contains("Ground beef 7%") == true)
        #expect(hints[1]?.contains("290 g") == true)
        #expect(result.items[0].calories == 360)
        #expect(!result.items[0].hasBlockingWarning)
    }

    @Test("The retry prompt carries the original description and the hint")
    func retryPromptKeepsTheDescription() async throws {
        var prompts: [String] = []
        _ = try await MealEstimateGeneration.run(description: "240g 7% ground beef") { attempt in
            prompts.append(attempt.prompt(for: "240g 7% ground beef"))
            return Self.estimate(prompts.count == 1 ? Fixtures.impossibleBeef : Fixtures.realisticBeef)
        }
        #expect(prompts[0] == "240g 7% ground beef")
        #expect(prompts[1].hasPrefix("240g 7% ground beef\n\n"))
        #expect(prompts[1].contains("implausible"))
    }

    @Test("An answer that stays impossible is returned flagged after exactly one retry")
    func persistentlyImplausibleAnswerIsFlagged() async throws {
        var calls = 0
        let result = try await MealEstimateGeneration.run(description: "240g 7% ground beef") { _ in
            calls += 1
            return Self.estimate(Fixtures.impossibleBeef)
        }
        #expect(calls == 2)
        #expect(result.items[0].warnings == [.macrosExceedPortion])
        #expect(result.items[0].hasBlockingWarning)
    }

    @Test("When both answers are flawed the one with fewer flagged items is kept")
    func fewerFlaggedItemsWins() async throws {
        var calls = 0
        let result = try await MealEstimateGeneration.run(description: "beef and rice") { _ in
            calls += 1
            if calls == 1 {
                return Self.estimate(
                    Fixtures.impossibleBeef,
                    Fixtures.item("Rice", grams: 100, calories: 900, protein: 80, carbs: 80, fat: 80)
                )
            }
            return Self.estimate(
                Fixtures.impossibleBeef,
                Fixtures.food("Rice", grams: 150, protein: 4, carbs: 42, fat: 1)
            )
        }
        #expect(calls == 2)
        #expect(result.items.map(\.name) == ["Ground beef 7%", "Rice"])
        #expect(MealEstimateValidator.blockingItemCount(in: result) == 1)
    }

    @Test("A dish returned together with its ingredients is retried and the ingredients-only answer wins")
    func duplicatedDishIsRetried() async throws {
        var hints: [String?] = []
        let result = try await MealEstimateGeneration.run(description: Self.burritoDescription) { attempt in
            hints.append(attempt.hint)
            return hints.count == 1 ? Self.burritoBowlWithIngredients : Self.ingredientsOnly
        }
        #expect(hints.count == 2)
        #expect(hints[1]?.contains("leave the dish itself out") == true)
        #expect(result.items.map(\.name) == ["Rice", "Black beans", "Chicken"])
        #expect(MealEstimateValidator.blockingItemCount(in: result) == 0)
    }

    @Test("A dish that stays duplicated is kept but flagged for the review screen")
    func persistentDuplicateIsFlagged() async throws {
        let result = try await MealEstimateGeneration.run(description: Self.burritoDescription) { _ in
            Self.burritoBowlWithIngredients
        }
        #expect(result.items.count == 4)
        #expect(result.items[0].warnings == [.duplicatesListedIngredients])
    }

    // MARK: - Decoding failures

    @Test("A decoding failure is retried with a request for a compact answer")
    func decodingFailureIsRetried() async throws {
        var attempts: [MealEstimateAttempt] = []
        let result = try await MealEstimateGeneration.run(description: "2 eggs") { attempt in
            attempts.append(attempt)
            if attempt.number == 1 { throw MealEstimatorError.decodingFailed }
            return Self.estimate(Fixtures.food("Eggs", grams: 110, protein: 14, carbs: 1, fat: 11))
        }
        #expect(attempts.map(\.number) == [1, 2])
        #expect(attempts[1].usesTools)
        #expect(attempts[1].hint == MealEstimateGeneration.simplificationHint(usesTools: true))
        #expect(result.items.count == 1)
    }

    @Test("Repeated decoding failures give up after three attempts, the last one without tools")
    func decodingFailureGivesUp() async {
        var attempts: [MealEstimateAttempt] = []
        do {
            _ = try await MealEstimateGeneration.run(description: "2 eggs") { attempt in
                attempts.append(attempt)
                throw MealEstimatorError.decodingFailed
            }
            Issue.record("Expected the decoding failure to propagate")
        } catch MealEstimatorError.decodingFailed {
            // The user sees `L10n.aiMealDecodingError`, not a raw deserialization message.
        } catch {
            Issue.record("Unexpected error: \(error)")
        }
        #expect(attempts.map(\.number) == [1, 2, 3])
        #expect(attempts.map(\.usesTools) == [true, true, false])
        #expect(attempts[2].hint?.contains("do not call any tool") == true)
    }

    @Test("A decoding failure on the corrective retry keeps the earlier flagged answer instead of failing")
    func decodingFailureAfterAnImplausibleAnswer() async throws {
        var calls = 0
        let result = try await MealEstimateGeneration.run(description: "240g 7% ground beef") { _ in
            calls += 1
            if calls == 2 { throw MealEstimatorError.decodingFailed }
            return Self.estimate(Fixtures.impossibleBeef)
        }
        #expect(calls == 2)
        #expect(result.items[0].hasBlockingWarning)
    }

    @Test("Other errors, such as a guardrail refusal, propagate at once for the fallback to handle")
    func otherErrorsPropagateImmediately() async {
        var calls = 0
        do {
            _ = try await MealEstimateGeneration.run(description: "2 eggs") { _ in
                calls += 1
                throw MealEstimatorError.guardrailViolation
            }
            Issue.record("Expected the guardrail violation to propagate")
        } catch MealEstimatorError.guardrailViolation {
            // expected
        } catch {
            Issue.record("Unexpected error: \(error)")
        }
        #expect(calls == 1)
    }

    // MARK: - Pieces

    @Test("The decoding error has its own user-facing message and may be retried on Private Cloud Compute")
    func decodingErrorMessageAndFallback() {
        #expect(MealEstimatorError.decodingFailed.localizedMessage == L10n.aiMealDecodingError)
        #expect(!L10n.aiMealDecodingError.isEmpty)
        #expect(MealEstimator.isRetryableOnPrivateCloud(MealEstimatorError.decodingFailed))
        #expect(MealEstimatorError.decodingFailed.telemetryReason == "decoding_failed")
    }

    @Test("Only the final attempt after repeated failures drops the food search tool")
    func simplificationHintMentionsToolsOnlyWhenDropped() {
        #expect(!MealEstimateGeneration.simplificationHint(usesTools: true).contains("tool"))
        #expect(MealEstimateGeneration.simplificationHint(usesTools: false).contains("do not call any tool"))
    }
}
