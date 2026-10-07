import Foundation

/// A problem `MealEstimateValidator` found with an estimated item, or a fix it
/// applied. `isBlocking` ones mean the numbers cannot be trusted as they are:
/// `AIMealReviewView` shows them next to the item, `MealEstimateGeneration`
/// retries once with a corrective hint, and `AiTaskProcessor` refuses to log
/// such an item unattended. Persisted with the item (`ProcessedAiTaskDraft`),
/// so the raw values have to stay stable.
enum MealEstimateWarning: String, Codable, Equatable, Sendable {
    /// Protein + carbs + fat + fiber weigh more than the portion itself.
    case macrosExceedPortion
    /// More energy than any food holds per gram (pure fat is about 9 kcal/g).
    case caloriesExceedPortion
    /// Calories disagree with the macros (4/4/9 Atwater) and could not be
    /// reconciled from them.
    case caloriesInconsistent
    /// A composite dish is listed together with its own ingredients, so the
    /// dish probably counts them twice.
    case duplicatesListedIngredients
    /// Informational: only the calories disagreed, so they were recomputed
    /// from the macros.
    case caloriesRecalculated

    var isBlocking: Bool {
        self != .caloriesRecalculated
    }
}

/// Sanity checks for an item the language model estimated. Pure and free of
/// FoundationModels types, so it is unit-tested without a model (see
/// `MealEstimateValidatorTests`) and the model's output is never trusted
/// blindly: a small on-device model happily returns 180 g of protein for a
/// 240 g portion of beef.
///
/// - Macros can never weigh more than the portion (when its weight is known).
/// - Calories have to roughly match the macros (4 kcal/g protein and carbs,
///   9 kcal/g fat, a little extra for fiber) and can never exceed the energy
///   density of pure fat.
/// - When only the calories are off, they are recomputed from the macros.
///   When the macros themselves are impossible nothing is invented: the item
///   is flagged so the generation can be retried or the user can look at it.
enum MealEstimateValidator {
    /// Rounding slack on the portion weight, as a fraction.
    static let portionWeightTolerance = 0.05
    static let portionWeightSlackGrams = 0.5
    /// Pure fat is about 9 kcal/g; nothing edible is denser.
    static let maxKilocaloriesPerGram = 9.3
    static let maxKilocaloriesSlack = 5.0
    /// Allowed deviation of calories from the macro energy, as a fraction,
    /// with a floor so tiny items do not trip on rounding.
    static let calorieTolerance = 0.2
    static let calorieToleranceFloor = 20.0
    /// Fiber is counted at 4 kcal/g inside carbs or not at all depending on
    /// who reports it; this much per gram is accepted either way.
    static let kilocaloriesPerFiberGram = 2.0

    // MARK: - Checking

    /// The blocking problems with these values. Used both for a freshly
    /// generated item and, live, for the values the user is editing in
    /// `AIMealReviewView`, so a warning disappears once the numbers are fixed.
    static func warnings(
        name: String,
        grams: Double?,
        calories: Double?,
        protein: Double?,
        carbs: Double?,
        fat: Double?,
        fiber: Double?
    ) -> [MealEstimateWarning] {
        let grams = portionGrams(grams)
        let protein = clean(protein) ?? 0
        let carbs = clean(carbs) ?? 0
        let fat = clean(fat) ?? 0
        let fiber = clean(fiber) ?? 0
        let calories = clean(calories)

        var result: [MealEstimateWarning] = []
        if let grams {
            let macroMass = protein + carbs + fat + fiber
            if macroMass > grams * (1 + portionWeightTolerance) + portionWeightSlackGrams {
                result.append(.macrosExceedPortion)
            }
            if let calories, calories > grams * maxKilocaloriesPerGram + maxKilocaloriesSlack {
                result.append(.caloriesExceedPortion)
            }
        }
        if let calories,
           !isEnergyConsistent(name: name, calories: calories, protein: protein, carbs: carbs, fat: fat, fiber: fiber)
        {
            result.append(.caloriesInconsistent)
        }
        return result
    }

    static func warnings(for item: MealEstimateItem) -> [MealEstimateWarning] {
        warnings(
            name: item.name,
            grams: item.grams,
            calories: item.calories,
            protein: item.protein,
            carbs: item.carbs,
            fat: item.fat,
            fiber: item.fiber
        )
    }

    /// Energy implied by the macros alone: 4 kcal/g protein and carbs, 9 kcal/g fat.
    static func macroEnergy(protein: Double?, carbs: Double?, fat: Double?) -> Double {
        (clean(protein) ?? 0) * 4 + (clean(carbs) ?? 0) * 4 + (clean(fat) ?? 0) * 9
    }

    /// Combined weight in grams of protein, carbs, fat and fiber.
    static func macroMass(of item: MealEstimateItem) -> Double {
        (clean(item.protein) ?? 0) + (clean(item.carbs) ?? 0) + (clean(item.fat) ?? 0) + (clean(item.fiber) ?? 0)
    }

    private static func isEnergyConsistent(
        name: String, calories: Double, protein: Double, carbs: Double, fat: Double, fiber: Double
    ) -> Bool {
        let expected = protein * 4 + carbs * 4 + fat * 9
        let tolerance = max(expected * calorieTolerance, calorieToleranceFloor) + fiber * kilocaloriesPerFiberGram
        let difference = calories - expected
        if abs(difference) <= tolerance { return true }
        // Alcohol (7 kcal/g) carries energy no macro accounts for.
        return difference > 0 && mentionsAlcohol(name)
    }

    private static let alcoholWords: Set<String> = [
        "beer", "bier", "wine", "wein", "vodka", "whisky", "whiskey", "gin", "rum", "tequila", "brandy",
        "cognac", "cider", "cocktail", "prosecco", "champagne", "sekt", "sake", "schnaps", "likor",
        "liqueur", "aperol", "spritz", "radler", "alcohol", "alkohol", "spirits",
    ]

    private static let alcoholSuffixes = ["bier", "wein"]

    static func mentionsAlcohol(_ name: String) -> Bool {
        let tokens = name
            .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil)
            .components(separatedBy: CharacterSet.letters.inverted)
            .filter { !$0.isEmpty }
        return tokens.contains { token in
            if alcoholWords.contains(token) { return true }
            // German compounds (Weissbier, Rotwein); "Schwein" is not wine.
            return alcoholSuffixes.contains { token.hasSuffix($0) } && !token.hasSuffix("schwein")
        }
    }

    // MARK: - Normalizing

    /// Fixes what can be fixed deterministically and flags the rest:
    /// `grams` is filled in from an explicit "240 g" quantity, calories that
    /// disagree with otherwise plausible macros are recomputed from them, and
    /// a dish listed together with its ingredients is marked as duplicated.
    /// Items matched to a food in the user's database are left alone: they
    /// are logged from that food, the estimated numbers never reach the diary.
    static func normalized(_ estimate: MealEstimate, description: String) -> MealEstimate {
        var result = estimate
        result.items = estimate.items.map { normalized($0) }
        result.items = MealEstimateDeduplicator.flaggingDuplicatedComposites(in: result.items, description: description)
        return result
    }

    static func normalized(_ item: MealEstimateItem) -> MealEstimateItem {
        guard item.matchedFoodId == nil else { return item }
        var item = item
        if portionGrams(item.grams) == nil {
            item.grams = statedGrams(in: item.quantityDescription)
        }

        var found = warnings(for: item)
        var notes: [MealEstimateWarning] = []
        let calorieProblem = found.contains(.caloriesInconsistent) || found.contains(.caloriesExceedPortion)
        let energy = macroEnergy(protein: item.protein, carbs: item.carbs, fat: item.fat)
        if calorieProblem, !found.contains(.macrosExceedPortion), energy > 0 {
            item.calories = energy.rounded()
            found = warnings(for: item)
            notes.append(.caloriesRecalculated)
        }
        let all = notes + found
        item.warnings = all.isEmpty ? nil : all
        return item
    }

    /// Number of items whose values cannot be trusted as they are.
    static func blockingItemCount(in estimate: MealEstimate) -> Int {
        estimate.items.filter { $0.hasBlockingWarning }.count
    }

    // MARK: - Corrective hint

    /// Text appended to the prompt for the one corrective retry, naming what
    /// was wrong with each flagged item. Nil when nothing is flagged.
    static func correctiveHint(for items: [MealEstimateItem]) -> String? {
        var lines: [String] = []
        for item in items {
            let warnings = item.warnings ?? []
            let name = promptSafe(item.name)
            if warnings.contains(.macrosExceedPortion), let grams = clean(item.grams) {
                lines.append(
                    "- \"\(name)\": protein, carbs, fat and fiber add up to \(whole(macroMass(of: item))) g, "
                        + "but the portion weighs only \(whole(grams)) g."
                )
            }
            if warnings.contains(.caloriesExceedPortion), let grams = clean(item.grams) {
                lines.append(
                    "- \"\(name)\": \(whole(item.calories ?? 0)) kcal is impossible for \(whole(grams)) g "
                        + "(no food has more than 9 kcal per gram)."
                )
            }
            if warnings.contains(.caloriesInconsistent) {
                let energy = macroEnergy(protein: item.protein, carbs: item.carbs, fat: item.fat)
                lines.append(
                    "- \"\(name)\": \(whole(item.calories ?? 0)) kcal does not match its macros "
                        + "(4 x protein + 4 x carbs + 9 x fat = \(whole(energy)) kcal)."
                )
            }
            if warnings.contains(.duplicatesListedIngredients) {
                lines.append(
                    "- \"\(name)\" is a dish whose ingredients are listed as separate items too. "
                        + "Return the ingredients only and leave the dish itself out."
                )
            }
        }
        guard !lines.isEmpty else { return nil }
        return """
        Your previous answer contained implausible values:
        \(lines.joined(separator: "\n"))
        Estimate the meal again. Every value is for the stated portion only. Protein + carbs + fat + fiber \
        in grams must stay clearly below the portion's weight, use realistic per-100 g values, and calories \
        must be about 4 x protein + 4 x carbs + 9 x fat.
        """
    }

    // MARK: - Helpers

    /// A "240 g" / "1.5 kg" quantity at the very start of the text; anything
    /// less explicit (e.g. "2 slices (60 g)", "2 x 30 g") is left to the model.
    static func statedGrams(in text: String) -> Double? {
        let trimmed = text.trimmingCharacters(in: .whitespaces).lowercased()
        var digits = ""
        var rest = Substring(trimmed)
        while let character = rest.first, isNumberCharacter(character) {
            digits.append(character)
            rest = rest.dropFirst()
        }
        guard !digits.isEmpty, let value = Double(digits.replacingOccurrences(of: ",", with: ".")), value > 0 else {
            return nil
        }
        let unit = String(rest.drop(while: { $0 == " " }).prefix(while: { $0.isLetter }))
        switch unit {
        case "g", "gr", "gram", "grams", "gramm", "gramme", "grammes":
            return value
        case "kg", "kilo", "kilos":
            return value * 1000
        default:
            return nil
        }
    }

    private static func isNumberCharacter(_ character: Character) -> Bool {
        (character.isASCII && character.isNumber) || character == "." || character == ","
    }

    /// A usable value: finite and not negative. Anything else counts as unknown.
    private static func clean(_ value: Double?) -> Double? {
        guard let value, value.isFinite else { return nil }
        return max(value, 0)
    }

    private static func portionGrams(_ value: Double?) -> Double? {
        guard let value = clean(value), value > 0 else { return nil }
        return value
    }

    /// `String(format:)` rather than `Int(_:)`, which traps on values outside
    /// the integer range; these numbers come straight from a language model.
    private static func whole(_ value: Double) -> String {
        String(format: "%.0f", value.rounded())
    }

    /// Model-written names go back into a prompt: keep them short and free of
    /// quotes and line breaks.
    private static func promptSafe(_ name: String) -> String {
        let flattened = name
            .replacingOccurrences(of: "\"", with: "'")
            .replacingOccurrences(of: "\n", with: " ")
        return String(flattened.prefix(60))
    }
}
