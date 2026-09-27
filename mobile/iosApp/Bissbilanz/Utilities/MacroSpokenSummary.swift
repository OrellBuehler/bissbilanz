import Foundation

/// Builds the spoken macro portion of a VoiceOver label for a composite food
/// row, e.g. "34 calories, protein 2 grams, carbs 6 grams, fat 0 grams" —
/// callers prepend whatever name/time context the row shows.
enum MacroSpokenSummary {
    static func macros(
        calories: Double,
        protein: Double,
        carbs: Double,
        fat: Double,
        fiber: Double? = nil
    ) -> String {
        var parts = [L10n.caloriesAmount(Int(calories.rounded()))]
        parts.append(gramsPart(L10n.protein, protein))
        parts.append(gramsPart(L10n.carbs, carbs))
        parts.append(gramsPart(L10n.fat, fat))
        if let fiber {
            parts.append(gramsPart(L10n.fiber, fiber))
        }
        return parts.joined(separator: ", ")
    }

    static func gramsPart(_ macroName: String, _ grams: Double) -> String {
        "\(macroName) \(Int(grams.rounded())) \(L10n.gramsUnit)"
    }
}
