import Foundation

/// Deterministic safeguard against the model counting a composite dish twice:
/// "burrito bowl with rice, black beans and chicken" must come back as the
/// ingredients OR as one bowl, but a small model sometimes returns the bowl
/// plus every ingredient. The prompt forbids it; this catches what slips by.
///
/// Deliberately conservative, because "X with Y" is just as often a side
/// ("burger with fries", "soup with bread") and an unlisted base (the bread of
/// a sandwich) must not disappear. The dish item is therefore only *flagged*
/// (`MealEstimateWarning.duplicatesListedIngredients`), never removed:
/// `AIMealReviewView` shows it switched off with an explanation, one tap
/// brings it back, and the unattended `AiTaskProcessor` routes such a result
/// to review instead of logging it. A dish is flagged only when
/// - the user's description names an assembled-dish word (bowl, salad, wrap, ...)
///   right before a "with ..." / "mit ..." / "(...)" ingredient list,
/// - an item carries the dish's name,
/// - at least two other items are named in that ingredient list, and
/// - the dish item holds a comparable share of the energy those items hold, so
///   it really does contain them (a bare base item next to its toppings is fine).
///
/// Pure, so it is unit-tested without a model (`MealEstimateValidatorTests`).
enum MealEstimateDeduplicator {
    private static let dishWords = [
        "bowl", "burrito", "salad", "salat", "sandwich", "wrap", "taco", "smoothie", "poke", "omelet",
    ]

    /// What introduces the ingredient list; matched against the lowercased,
    /// diacritic-folded description.
    private static let connectors = [
        " with ", " mit ", " containing ", " including ", " incl. ", " inkl. ", " made of ", " made with ",
        " aus ", ": ", " (",
    ]

    private static let clauseSeparators = [",", ";", " and ", " und ", " + ", " & ", " plus ", " sowie "]

    /// Where the ingredient list ends and a separate item starts: "... and a
    /// cola" names a drink next to the dish, not part of it.
    private static let newItemMarkers = [
        " and a ", " and an ", " and some ", " und ein ", " und eine ", " und einen ", " und etwas ",
        ", a ", ", an ", ", ein ", ", eine ", ", einen ",
    ]

    private static let stopWords: Set<String> = [
        "a", "an", "the", "some", "my", "of", "i", "had", "ate", "have", "large", "small", "big", "medium",
        "and", "or", "with", "ein", "eine", "einen", "einem", "einer", "der", "die", "das", "und", "oder", "mit",
        "mein", "meine", "etwas", "ich", "habe", "hatte", "gegessen", "grosse", "grosser", "grosses", "kleine",
        "kleiner", "kleines", "portion", "serving",
    ]

    /// The dish item must hold at least this share of its listed ingredients' energy.
    static let minimumCompositeShare = 0.5
    static let minimumListedIngredients = 2

    static func flaggingDuplicatedComposites(in items: [MealEstimateItem], description: String) -> [MealEstimateItem] {
        guard items.count > minimumListedIngredients, let split = splitDish(description) else { return items }
        let dishTokens = Array(contentTokens(lastClause(of: split.head)).suffix(2))
        guard let lastDishToken = dishTokens.last, isDishWord(lastDishToken) else { return items }
        let ingredientTokens = contentTokens(split.tail)
        guard !ingredientTokens.isEmpty else { return items }

        for (index, candidate) in items.enumerated() {
            // A food from the user's own database is logged as that food; keep it.
            guard candidate.matchedFoodId == nil else { continue }
            let candidateTokens = contentTokens(candidate.name)
            guard !candidateTokens.isEmpty, containsAll(dishTokens, in: candidateTokens) else { continue }

            var listedCount = 0
            var listedCalories = 0.0
            for (otherIndex, other) in items.enumerated() where otherIndex != index {
                if isListed(other, in: ingredientTokens) {
                    listedCount += 1
                    listedCalories += other.calories ?? 0
                }
            }
            guard listedCount >= minimumListedIngredients, listedCalories > 0 else { continue }
            guard (candidate.calories ?? 0) >= listedCalories * minimumCompositeShare else { continue }

            var flagged = items
            var warnings = candidate.warnings ?? []
            if !warnings.contains(.duplicatesListedIngredients) {
                warnings.append(.duplicatesListedIngredients)
            }
            flagged[index].warnings = warnings
            return flagged
        }
        return items
    }

    // MARK: - Parsing

    private static func fold(_ text: String) -> String {
        text.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil)
    }

    /// The description cut at its first ingredient-list connector.
    private static func splitDish(_ description: String) -> (head: String, tail: String)? {
        let text = fold(description)
        var first: Range<String.Index>?
        for connector in connectors {
            guard let range = text.range(of: connector) else { continue }
            if let current = first, current.lowerBound <= range.lowerBound { continue }
            first = range
        }
        guard let range = first else { return nil }
        let tail = String(text[range.upperBound...])
        return (String(text[..<range.lowerBound]), endOfIngredientList(in: tail))
    }

    private static func endOfIngredientList(in tail: String) -> String {
        var end = tail.endIndex
        for marker in newItemMarkers {
            if let range = tail.range(of: marker), range.lowerBound < end {
                end = range.lowerBound
            }
        }
        return String(tail[..<end])
    }

    /// "a salad and a burrito bowl" -> "a burrito bowl".
    private static func lastClause(of head: String) -> String {
        var text = head
        for separator in clauseSeparators {
            text = text.replacingOccurrences(of: separator, with: "|")
        }
        guard let last = text.split(separator: "|").last else { return head }
        return String(last)
    }

    /// Words of `text` that say something about the food: no quantities
    /// ("240g", "2"), no articles or filler.
    private static func contentTokens(_ text: String) -> [String] {
        fold(text)
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { token in
                guard let first = token.first, token.count > 1 else { return false }
                return !first.isNumber && !stopWords.contains(token)
            }
    }

    /// Equal, or one a prefix of the other (at least four letters), which
    /// covers plurals and German inflections: bohne/bohnen, bean/beans.
    private static func tokensMatch(_ lhs: String, _ rhs: String) -> Bool {
        if lhs == rhs { return true }
        let shorter = lhs.count <= rhs.count ? lhs : rhs
        let longer = lhs.count <= rhs.count ? rhs : lhs
        return shorter.count >= 4 && longer.hasPrefix(shorter)
    }

    private static func isDishWord(_ token: String) -> Bool {
        dishWords.contains { tokensMatch($0, token) }
    }

    private static func containsAll(_ needles: [String], in tokens: [String]) -> Bool {
        needles.allSatisfy { needle in tokens.contains { tokensMatch($0, needle) } }
    }

    private static func isListed(_ item: MealEstimateItem, in ingredientTokens: [String]) -> Bool {
        contentTokens(item.name).contains { token in
            ingredientTokens.contains { tokensMatch($0, token) }
        }
    }
}
