import Foundation

/// Port of the server's `normalizeLabel` (src/lib/labels.ts). A search query is
/// folded through this before it is compared with a food's stored labels, so
/// both sides agree on the exact string — the server already normalized what it
/// stored. Deliberately crude singularization, like the server: it only has to
/// be consistent with it.
enum LabelNormalizer {
    static let maxLabelsPerFood = 20
    private static let maxLabelLength = 40
    private static let maxLabelWords = 3

    static func normalize(_ raw: String) -> String? {
        // Decompose and drop combining marks, so "Püree" folds to "puree".
        let folded = raw
            .decomposedStringWithCanonicalMapping
            .unicodeScalars
            .filter { !$0.properties.isDiacritic }
            .map { Character($0) }
        let lowered = String(folded).lowercased()

        // A letter that is still not ASCII (ß, Cyrillic, CJK, …) can never match.
        let isAsciiLower = { (scalar: Unicode.Scalar) in scalar.value >= 0x61 && scalar.value <= 0x7A }
        if lowered.unicodeScalars.contains(where: { $0.properties.isAlphabetic && !isAsciiLower($0) }) {
            return nil
        }

        var cleaned = lowered.replacingOccurrences(of: "['\u{2018}\u{2019}\u{02bc}]", with: "", options: .regularExpression)
        cleaned = cleaned.replacingOccurrences(of: "[^a-z0-9]+", with: " ", options: .regularExpression)
        cleaned = cleaned.trimmingCharacters(in: .whitespaces)
        guard !cleaned.isEmpty else { return nil }

        let words = cleaned.split(separator: " ").map(String.init)
        guard words.count <= maxLabelWords else { return nil }

        let singular = words.map(singularize).joined(separator: " ")
        guard !singular.isEmpty, singular.count <= maxLabelLength else { return nil }
        return singular
    }

    /// Normalize, drop rejects, dedupe, and cap at `maxLabelsPerFood`.
    static func normalizeAll(_ raw: [String]) -> [String] {
        var seen: [String] = []
        for value in raw {
            if let label = normalize(value), !seen.contains(label) {
                seen.append(label)
            }
            if seen.count >= maxLabelsPerFood { break }
        }
        return seen
    }

    private static func singularize(_ word: String) -> String {
        guard word.count > 3 else { return word }
        if word.range(of: "(ss|us|is)$", options: .regularExpression) != nil { return word }
        if word.hasSuffix("ies"), word.count > 4 { return String(word.dropLast(3)) + "y" }
        if word.range(of: "(ches|shes|xes|zes|sses)$", options: .regularExpression) != nil {
            return String(word.dropLast(2))
        }
        if word.hasSuffix("oes") { return String(word.dropLast(2)) }
        if word.hasSuffix("s") { return String(word.dropLast(1)) }
        return word
    }
}
