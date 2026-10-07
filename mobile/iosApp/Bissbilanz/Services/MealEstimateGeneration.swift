import Foundation

/// One try at generating an estimate. The first is the plain prompt; later
/// ones carry a hint explaining why the previous answer was rejected, and the
/// last one after repeated decoding failures runs without the food search
/// tool so a long tool transcript cannot crowd the answer out of the model's
/// small context window.
struct MealEstimateAttempt: Equatable {
    let number: Int
    let hint: String?
    let usesTools: Bool

    static let first = MealEstimateAttempt(number: 1, hint: nil, usesTools: true)

    func prompt(for description: String) -> String {
        guard let hint else { return description }
        return "\(description)\n\n\(hint)"
    }
}

/// Retry policy around a single model call, shared by the on-device, Private
/// Cloud Compute and photo paths of `MealEstimator`. The model call itself is
/// the `generate` closure, so the policy is unit-tested with fakes
/// (`MealEstimateGenerationTests`) and never depends on a live model.
///
/// - A **decoding failure** (`MealEstimatorError.decodingFailed`, the
///   "deserialize" error: generation ended before a complete answer, typically
///   a context overflow or a runaway list) is retried, up to `maxAttempts`
///   tries in total, with a request to keep the answer compact. Giving up
///   throws, after reporting it.
/// - An answer with **implausible values** (`MealEstimateValidator`) gets one
///   corrective retry that names the problems. The best answer wins; whatever
///   is still implausible stays flagged for the review screen.
/// - Every other error propagates unchanged, so `MealEstimator.estimateWithFallback`
///   keeps routing refusals and context overflows to Private Cloud Compute.
enum MealEstimateGeneration {
    static let maxAttempts = 3

    @MainActor
    static func run(
        description: String,
        generate: @MainActor (MealEstimateAttempt) async throws -> MealEstimate
    ) async throws -> MealEstimate {
        var attempt = MealEstimateAttempt.first
        var best: MealEstimate?
        var correctiveRetryUsed = false
        while true {
            try Task.checkCancellation()
            do {
                let raw = try await generate(attempt)
                let normalized = MealEstimateValidator.normalized(raw, description: description)
                let flagged = MealEstimateValidator.blockingItemCount(in: normalized)
                if let current = best {
                    if flagged < MealEstimateValidator.blockingItemCount(in: current) { best = normalized }
                } else {
                    best = normalized
                }
                guard flagged > 0 else { return normalized }

                guard !correctiveRetryUsed, attempt.number < maxAttempts,
                      let hint = MealEstimateValidator.correctiveHint(for: normalized.items)
                else {
                    let result = best ?? normalized
                    reportImplausible(result, attempts: attempt.number)
                    return result
                }
                correctiveRetryUsed = true
                ErrorReporter.addBreadcrumb(
                    "Meal estimate had implausible values, retrying once",
                    category: "ai_meal",
                    data: ["flagged_items": flagged, "attempt": attempt.number]
                )
                attempt = MealEstimateAttempt(number: attempt.number + 1, hint: hint, usesTools: attempt.usesTools)
            } catch MealEstimatorError.decodingFailed {
                // A previous attempt already produced something usable.
                if let best {
                    reportImplausible(best, attempts: attempt.number)
                    return best
                }
                guard attempt.number < maxAttempts else {
                    ErrorReporter.captureWarning(
                        "Meal estimate could not be decoded, giving up",
                        context: ["reason": "decoding_failure", "attempts": attempt.number]
                    )
                    throw MealEstimatorError.decodingFailed
                }
                ErrorReporter.addBreadcrumb(
                    "Meal estimate could not be decoded, retrying",
                    category: "ai_meal",
                    data: ["attempt": attempt.number]
                )
                let nextNumber = attempt.number + 1
                let nextUsesTools = nextNumber < maxAttempts
                attempt = MealEstimateAttempt(
                    number: nextNumber,
                    hint: simplificationHint(usesTools: nextUsesTools),
                    usesTools: nextUsesTools
                )
            }
        }
    }

    /// Asked for after a decoding failure: shorter output is the likeliest fix.
    static func simplificationHint(usesTools: Bool) -> String {
        var hint = "Your previous answer could not be read. Answer again with a compact list: short item names "
            + "and at most 8 items, combining minor ingredients such as oil, spices and sauces into the main item."
        if !usesTools {
            hint += " The food database is not available this time: do not call any tool and leave matchedFoodId unset."
        }
        return hint
    }

    private static func reportImplausible(_ estimate: MealEstimate, attempts: Int) {
        var kinds: Set<String> = []
        for item in estimate.items {
            for warning in item.warnings ?? [] where warning.isBlocking {
                kinds.insert(warning.rawValue)
            }
        }
        ErrorReporter.captureWarning(
            "Meal estimate still has implausible values after retry",
            context: [
                "reason": "implausible_estimate",
                "attempts": attempts,
                "flagged_items": MealEstimateValidator.blockingItemCount(in: estimate),
                "warnings": kinds.sorted().joined(separator: ","),
            ]
        )
    }
}
