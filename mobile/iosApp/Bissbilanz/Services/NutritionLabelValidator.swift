import Foundation

/// Sanity-checks a Foundation Models nutrition-label extraction and merges it
/// with the deterministic Vision+parser result.
///
/// Foundation Models reads the whole photo with real language understanding
/// and can recover values the regex-based parser deliberately skips — fat
/// breakdown, cholesterol, minerals (see `NutritionLabelParser`'s `.ignore`
/// cases and its doc comment) — but a language model can also hallucinate a
/// plausible-looking number instead of reporting nil. This type is pure and
/// has no Vision/FoundationModels dependency, so the validation/merge logic
/// is unit-testable without a device or the model itself.
enum NutritionLabelValidator {
    /// Per-100 g/ml basis: no macro can plausibly exceed 100 g.
    private static let maxGrams = 100.0
    /// Generous ceiling for milligram/microgram fields — wide enough to never
    /// reject a real value, just to catch garbage (a misplaced decimal, a
    /// hallucinated four-digit reading).
    private static let maxTrace = 100_000.0
    /// Pure fat is ~900 kcal per 100 g; nothing on a food label goes higher.
    private static let maxCalories = 900.0

    /// `nonisolated(unsafe)` because these are immutable tables of key paths
    /// (which are not formally Sendable) accessed read-only — same rationale
    /// as `NutritionLabelParser.matchers`.
    private nonisolated(unsafe) static let gramKeyPaths: [WritableKeyPath<ParsedNutrition, Double?>] = [
        \.protein, \.carbs, \.sugar, \.fat, \.saturatedFat, \.fiber, \.salt,
        \.monounsaturatedFat, \.polyunsaturatedFat, \.transFat, \.addedSugars,
    ]

    private nonisolated(unsafe) static let traceKeyPaths: [WritableKeyPath<ParsedNutrition, Double?>] = [
        \.sodium, \.cholesterol, \.potassium, \.calcium, \.iron, \.vitaminD,
    ]

    /// The core macro/energy fields checked for mutual consistency below —
    /// wiped together when that check fails, since a bad energy figure
    /// usually means the wrong row or column was read, not that one macro in
    /// isolation is wrong.
    private nonisolated(unsafe) static let coreMacroKeyPaths: [WritableKeyPath<ParsedNutrition, Double?>] = [
        \.protein, \.carbs, \.sugar, \.fat, \.saturatedFat, \.fiber,
    ]

    private static func clamped(_ value: Double?, upperBound: Double) -> Double? {
        guard let value, value.isFinite, value >= 0, value <= upperBound else { return nil }
        return value
    }

    /// Drops any field that is negative, non-finite, or outside a generous
    /// per-100 g/ml ceiling. Leaves everything else (including fields the
    /// fallback never populates) untouched.
    private static func sanitized(_ candidate: ParsedNutrition) -> ParsedNutrition {
        var result = candidate
        result.calories = clamped(candidate.calories, upperBound: maxCalories)
        for keyPath in gramKeyPaths {
            result[keyPath: keyPath] = clamped(candidate[keyPath: keyPath], upperBound: maxGrams)
        }
        for keyPath in traceKeyPaths {
            result[keyPath: keyPath] = clamped(candidate[keyPath: keyPath], upperBound: maxTrace)
        }
        return result
    }

    /// Whether reported energy is roughly consistent with the reported
    /// macros (Atwater factors: 4 kcal/g protein & carbs, 9 kcal/g fat).
    /// Deliberately generous — labels round, fibre/alcohol/polyols use
    /// different factors the model isn't asked to account for, and rounding
    /// compounds further when the model computed a per-100 basis itself from
    /// a per-serving-only column, which gets a wider tolerance still.
    private static func isEnergyConsistent(_ candidate: ParsedNutrition, relaxed: Bool) -> Bool {
        guard let calories = candidate.calories else { return true }
        let protein = candidate.protein ?? 0
        let carbs = candidate.carbs ?? 0
        let fat = candidate.fat ?? 0
        guard protein > 0 || carbs > 0 || fat > 0 else { return true }
        let expected = protein * 4 + carbs * 4 + fat * 9
        let tolerance = relaxed ? max(expected * 0.35, 60) : max(expected * 0.25, 40)
        return abs(calories - expected) <= tolerance
    }

    /// Whether the core macros hang together as a set: sugar can't exceed
    /// total carbohydrate, saturated fat can't exceed total fat, and the
    /// reported energy has to roughly match. A small tolerance absorbs
    /// rounding on the label itself.
    private static func areCoreMacrosCoherent(_ candidate: ParsedNutrition, relaxedEnergy: Bool) -> Bool {
        if let sugar = candidate.sugar, let carbs = candidate.carbs, sugar > carbs + 0.5 {
            return false
        }
        if let saturatedFat = candidate.saturatedFat, let fat = candidate.fat, saturatedFat > fat + 0.5 {
            return false
        }
        return isEnergyConsistent(candidate, relaxed: relaxedEnergy)
    }

    /// Merges a Foundation Models candidate with the Vision+parser fallback.
    ///
    /// Every field is first range/sign-checked independently. The core
    /// macro/energy fields are additionally checked as a group: if they
    /// don't hang together, all of them are dropped rather than
    /// cherry-picking the individually in-range ones, since an inconsistent
    /// energy figure usually means the model read the wrong row or column
    /// entirely. Extended fields (fat breakdown, minerals) and the barcode
    /// aren't part of that group — they're independent readings the
    /// regex parser never attempts, so one bad macro doesn't invalidate them.
    /// Anything still missing from the model's result after that is
    /// backfilled from the fallback.
    ///
    /// - Parameter computedFromServing: true when the model reported that it
    ///   derived the per-100 values itself from a per-serving-only column
    ///   (`NutritionLabelExtraction.valuesAreBasisPer100 == false`), which
    ///   widens the energy-consistency tolerance to absorb the extra
    ///   rounding that conversion introduces.
    static func merge(model: ParsedNutrition, fallback: ParsedNutrition, computedFromServing: Bool) -> ParsedNutrition {
        var result = sanitized(model)

        if !areCoreMacrosCoherent(result, relaxedEnergy: computedFromServing) {
            result.calories = nil
            for keyPath in coreMacroKeyPaths {
                result[keyPath: keyPath] = nil
            }
        }

        result.calories = result.calories ?? fallback.calories
        for keyPath in coreMacroKeyPaths {
            result[keyPath: keyPath] = result[keyPath: keyPath] ?? fallback[keyPath: keyPath]
        }
        result.salt = result.salt ?? fallback.salt
        result.sodium = result.sodium ?? fallback.sodium
        result.isVolume = result.isVolume || fallback.isVolume

        return result
    }

    /// Whether a scan result is confident enough to treat the photo it came
    /// from as an actual nutrition-facts panel, rather than an ordinary food
    /// photo Vision or Foundation Models happened to read a stray number or
    /// two off of (packaging text, a price tag, a barcode's printed digits).
    /// Used by `AiTaskProcessor` to decide which of an `AiTask`'s photos to
    /// treat as a label — `hasCoreMacros` alone (any *one* of calories/
    /// protein/carbs/fat) is too weak a bar for that unattended decision, so
    /// this additionally requires energy to roughly agree with the macros
    /// that were actually read, the same coherence check `merge` applies.
    /// Deliberately independent of the barcode: a photo can be a valid label
    /// with no barcode in frame, or carry a barcode with no legible label.
    static func isValidLabel(_ nutrition: ParsedNutrition) -> Bool {
        guard nutrition.calories != nil else { return false }
        let macroCount = [nutrition.protein, nutrition.carbs, nutrition.fat]
            .filter { $0 != nil }
            .count
        guard macroCount >= 2 else { return false }
        return isEnergyConsistent(nutrition, relaxed: true)
    }
}
