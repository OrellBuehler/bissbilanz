import Foundation

/// One try at generating an estimate. The first is the plain prompt; later
/// ones carry a hint explaining why the previous answer was rejected, and the
/// last one after repeated decoding failures runs without the food search
/// tool so a long tool transcript cannot crowd the answer out of the model's
/// small context window. A context overflow shrinks the input right away:
/// fewer matches per food search first, then no food search at all.
struct MealEstimateAttempt: Equatable {
    let number: Int
    let hint: String?
    let usesTools: Bool
    var toolResultLimit = MealEstimateAttempt.fullToolResultLimit

    static let fullToolResultLimit = 5
    static let compactToolResultLimit = 2

    static let first = MealEstimateAttempt(number: 1, hint: nil, usesTools: true)

    func prompt(for description: String) -> String {
        guard let hint else { return description }
        return "\(description)\n\n\(hint)"
    }

    /// The next try after this one overflowed the model's context window, or
    /// nil when no food search is left to cut. The tool results are what grows
    /// with every item, so the retry keeps the search with fewer matches when
    /// it can and drops it on the last attempt.
    func afterContextOverflow() -> MealEstimateAttempt? {
        guard usesTools else { return nil }
        let nextNumber = number + 1
        let keepsTools = toolResultLimit > Self.compactToolResultLimit
            && nextNumber < MealEstimateGeneration.maxAttempts
        return MealEstimateAttempt(
            number: nextNumber,
            hint: MealEstimateGeneration.contextOverflowHint(usesTools: keepsTools),
            usesTools: keepsTools,
            toolResultLimit: Self.compactToolResultLimit
        )
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
/// - A **context overflow** (`MealEstimatorError.contextWindowExceeded`) is
///   retried with less input (`MealEstimateAttempt.afterContextOverflow`)
///   within the same `maxAttempts`. Giving up throws without reporting, so
///   `MealEstimator.estimateWithFallback` can still route it to Private Cloud
///   Compute and reports it only if no estimate came of it.
/// - An answer with **implausible values** (`MealEstimateValidator`) gets one
///   corrective retry that names the problems. The best answer wins; whatever
///   is still implausible stays flagged for the review screen.
/// - Every other error propagates unchanged, so `MealEstimator.estimateWithFallback`
///   keeps routing refusals to Private Cloud Compute.
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
                attempt = MealEstimateAttempt(
                    number: attempt.number + 1,
                    hint: hint,
                    usesTools: attempt.usesTools,
                    toolResultLimit: attempt.toolResultLimit
                )
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
                    usesTools: nextUsesTools,
                    toolResultLimit: attempt.toolResultLimit
                )
            } catch MealEstimatorError.contextWindowExceeded(let matchedMessage) {
                // The corrective retry's longer prompt overflowed; keep the
                // flagged answer it was meant to improve.
                if let best {
                    reportImplausible(best, attempts: attempt.number)
                    return best
                }
                guard attempt.number < maxAttempts, let next = attempt.afterContextOverflow() else {
                    // Not reported here: a fallback may still produce an
                    // estimate. `MealEstimator.estimateWithFallback` reports
                    // the overflow once nothing did.
                    ErrorReporter.addBreadcrumb(
                        "Meal estimate exceeded the context window on every attempt",
                        category: "ai_meal",
                        data: ["attempts": attempt.number]
                    )
                    throw MealEstimatorError.contextWindowExceeded(matchedMessage: matchedMessage)
                }
                ErrorReporter.addBreadcrumb(
                    "Meal estimate exceeded the context window, retrying with less input",
                    category: "ai_meal",
                    data: ["attempt": attempt.number, "uses_tools": next.usesTools]
                )
                attempt = next
            }
        }
    }

    private static let noToolsHint = " The food database is not available this time: do not call any tool and leave "
        + "matchedFoodId unset."

    /// Asked for after a decoding failure: shorter output is the likeliest fix.
    static func simplificationHint(usesTools: Bool) -> String {
        var hint = "Your previous answer could not be read. Answer again with a compact list: short item names "
            + "and at most 8 items, combining minor ingredients such as oil, spices and sauces into the main item."
        if !usesTools {
            hint += noToolsHint
        }
        return hint
    }

    /// Asked for after a context overflow: fewer items mean fewer food searches
    /// and a shorter answer, both of which have to fit the same window.
    static func contextOverflowHint(usesTools: Bool) -> String {
        var hint = "Keep the answer compact: short item names and at most 8 items, combining minor ingredients "
            + "such as oil, spices and sauces into the main item."
        if !usesTools {
            hint += noToolsHint
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
