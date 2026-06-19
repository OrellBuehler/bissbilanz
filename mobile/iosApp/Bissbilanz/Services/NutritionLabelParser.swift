import CoreGraphics
import Foundation

/// A single line of recognized text with its normalized bounding box (Vision
/// convention: origin bottom-left, 0...1). Produced by `NutritionLabelScanner`
/// and consumed by the parser's row clustering.
struct OCRTextLine: Equatable {
    let text: String
    let boundingBox: CGRect
}

/// Heuristic, on-device parser that turns the text of a nutrition-facts panel
/// into a `ParsedNutrition`. It is intentionally Vision-agnostic: it operates
/// on plain row strings so the same logic serves both the iOS 18 line-based
/// recognizer and the iOS 26 document/table recognizer, and so it can be unit
/// tested without the camera.
///
/// Supported formats: EU panels (kJ/kcal, "of which …" / "davon …" sub-rows,
/// salt) and US "Nutrition Facts" (sodium, %DV column). Values are read on a
/// per-100 g basis (the canonical column on EU labels and the first numeric
/// column elsewhere); the user adjusts to per-portion in the confirmation sheet.
enum NutritionLabelParser {
    // MARK: - Public API

    /// Parses already-assembled rows (one nutrient per row, left-to-right text).
    static func parse(rows: [String]) -> ParsedNutrition {
        var result = ParsedNutrition()
        for row in rows {
            let folded = fold(row)
            guard let nutrient = match(folded) else { continue }
            switch nutrient {
            case .ignore:
                continue
            case .energy:
                if result.calories == nil, let kcal = energyKcal(in: row) {
                    result.calories = round2(kcal)
                }
            case let .field(keyPath, unit):
                guard result[keyPath: keyPath] == nil,
                      let measured = firstValue(in: row)
                else { continue }
                result[keyPath: keyPath] = round2(convert(measured, to: unit))
            }
        }
        return result
    }

    /// Convenience: cluster raw OCR lines into rows, then parse.
    static func parse(lines: [OCRTextLine]) -> ParsedNutrition {
        parse(rows: assembleRows(from: lines))
    }

    /// Groups recognized lines that share a baseline into a single row (so a
    /// label in the left column and its value in the right column are read
    /// together), ordering each row left-to-right and rows top-to-bottom.
    static func assembleRows(from lines: [OCRTextLine]) -> [String] {
        let usable = lines
            .filter { !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            .sorted { $0.boundingBox.midY > $1.boundingBox.midY } // top (high y) first

        var rows: [[OCRTextLine]] = []
        for line in usable {
            if let index = rows.firstIndex(where: { row in
                guard let reference = row.first else { return false }
                let tolerance = max(reference.boundingBox.height, line.boundingBox.height) * 0.6
                return abs(reference.boundingBox.midY - line.boundingBox.midY) <= tolerance
            }) {
                rows[index].append(line)
            } else {
                rows.append([line])
            }
        }

        return rows.map { row in
            row
                .sorted { $0.boundingBox.minX < $1.boundingBox.minX }
                .map(\.text)
                .joined(separator: " ")
        }
    }

    // MARK: - Nutrient matching

    /// How a parsed numeric value relates to the `FoodCreate` unit convention.
    private enum FieldUnit {
        case grams // value already in grams
        case milligrams // value already in milligrams
    }

    private enum Nutrient {
        case energy
        case field(WritableKeyPath<ParsedNutrition, Double?>, FieldUnit)
        case ignore
    }

    /// Ordered most-specific first so substrings resolve correctly:
    /// "saturated fat" before "fat", "of which sugars" before "carbohydrate".
    /// Keywords are stored pre-folded (lowercase, ß→ss, diacritics removed).
    /// `nonisolated(unsafe)` because this is an immutable table of key paths
    /// (which are not formally Sendable) accessed read-only.
    private nonisolated(unsafe) static let matchers: [(keywords: [String], nutrient: Nutrient)] = [
        // Skip fat sub-rows that would otherwise be misread as a macro:
        // "unsaturated"/"ungesättigte" contains "gesättigte fettsäuren", and
        // "trans fat" contains "fat".
        (["trans", "unsaturated", "ungesattigte"], .ignore),
        (
            ["of which saturates", "saturated fat", "saturates", "gesattigte fettsauren", "davon gesattigte"],
            .field(\.saturatedFat, .grams)
        ),
        (
            ["of which sugars", "of which sugar", "total sugars", "sugars", "sugar", "davon zucker", "zucker"],
            .field(\.sugar, .grams)
        ),
        (["dietary fibre", "dietary fiber", "fibre", "fiber", "ballaststoffe"], .field(\.fiber, .grams)),
        (["protein", "eiweiss"], .field(\.protein, .grams)),
        (
            ["total carbohydrate", "carbohydrates", "carbohydrate", "kohlenhydrate", "kohlenhydrat"],
            .field(\.carbs, .grams)
        ),
        (["total fat", "fat", "fett"], .field(\.fat, .grams)),
        (["salt", "salz"], .field(\.salt, .grams)),
        (["sodium", "natrium"], .field(\.sodium, .milligrams)),
        (["energy", "energie", "brennwert", "calories", "kalorien", "kcal", "kj"], .energy),
    ]

    private static func match(_ folded: String) -> Nutrient? {
        for matcher in matchers where matcher.keywords.contains(where: folded.contains) {
            return matcher.nutrient
        }
        return nil
    }

    // MARK: - Value extraction

    private static let numberToken = "[0-9]+(?:[.,\\s][0-9]+)*"
    private static let units = ["kcal", "kj", "mg", "\u{00B5}g", "mcg", "g", "ml"]

    /// A number plus the unit printed immediately after it (if any).
    private struct Measurement {
        let value: Double
        let unit: String?
    }

    /// Energy in kcal: prefer an explicit kcal figure, else convert kJ, else
    /// fall back to the first number (US "Calories" has no unit word).
    private static func energyKcal(in row: String) -> Double? {
        let cleaned = stripBasis(row).lowercased()
        if let kcal = firstNumber(in: cleaned, followedBy: "kcal") {
            return kcal
        }
        if let kj = firstNumber(in: cleaned, followedBy: "kj", energyKJ: true) {
            return kj / 4.184
        }
        return firstValue(in: row)?.value
    }

    /// First numeric value in a row, with the unit token that follows it.
    private static func firstValue(in row: String) -> Measurement? {
        let cleaned = stripBasis(row)
        guard let range = cleaned.range(of: numberToken, options: .regularExpression) else { return nil }
        guard let value = parseDecimal(String(cleaned[range])) else { return nil }

        let rest = cleaned[range.upperBound...].trimmingCharacters(in: .whitespaces).lowercased()
        let unit = units.first { rest.hasPrefix($0) }
        return Measurement(value: value, unit: unit)
    }

    /// First number that is immediately followed by `unit` (e.g. "375 kcal").
    private static func firstNumber(in lowercased: String, followedBy unit: String, energyKJ: Bool = false) -> Double? {
        let pattern = "(\(numberToken))\\s*\(NSRegularExpression.escapedPattern(for: unit))"
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: lowercased, range: NSRange(lowercased.startIndex..., in: lowercased)),
              let captureRange = Range(match.range(at: 1), in: lowercased)
        else {
            return nil
        }
        return parseDecimal(String(lowercased[captureRange]), energyKJ: energyKJ)
    }

    private static func convert(_ measured: Measurement, to unit: FieldUnit) -> Double {
        switch unit {
        case .grams:
            // Salt is the only gram field commonly printed in mg.
            measured.unit == "mg" ? measured.value / 1000 : measured.value
        case .milligrams:
            // Sodium is usually mg (US); EU prints it in grams.
            measured.unit == "g" ? measured.value * 1000 : measured.value
        }
    }

    // MARK: - Number normalization

    /// Removes the "per 100 g / pro 100 g / je 100 ml" basis phrase so its
    /// digits are not mistaken for a nutrient value.
    private static func stripBasis(_ row: String) -> String {
        let pattern = "(?i)(per|pro|je)\\s*100\\s*(g|ml|kcal|kj)?"
        return row.replacingOccurrences(of: pattern, with: " ", options: .regularExpression)
    }

    /// Parses a numeric token handling decimal comma vs point and thousands
    /// separators. `energyKJ` treats a lone "1.569"-style dot as thousands.
    static func parseDecimal(_ token: String, energyKJ: Bool = false) -> Double? {
        var cleaned = token.replacingOccurrences(of: " ", with: "")
        let hasComma = cleaned.contains(",")
        let hasDot = cleaned.contains(".")

        if hasComma, hasDot {
            // The right-most separator is the decimal point.
            if cleaned.lastIndex(of: ",")! > cleaned.lastIndex(of: ".")! {
                cleaned = cleaned.replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ",", with: ".")
            } else {
                cleaned = cleaned.replacingOccurrences(of: ",", with: "")
            }
        } else if hasComma {
            cleaned = cleaned.replacingOccurrences(of: ",", with: ".")
        } else if hasDot {
            let parts = cleaned.split(separator: ".")
            let dotIsThousands = parts.count > 2 || (energyKJ && parts.count == 2 && parts[1].count == 3)
            if dotIsThousands {
                cleaned = cleaned.replacingOccurrences(of: ".", with: "")
            }
        }
        return Double(cleaned)
    }

    // MARK: - Text folding

    /// Lowercases, expands ß→ss and strips diacritics so EN/DE keywords match
    /// regardless of OCR diacritic fidelity ("Gesättigte" → "gesattigte").
    private static func fold(_ text: String) -> String {
        text
            .replacingOccurrences(of: "\u{00DF}", with: "ss")
            .folding(options: .diacriticInsensitive, locale: Locale(identifier: "en_US"))
            .lowercased()
    }

    private static func round2(_ value: Double) -> Double {
        (value * 100).rounded() / 100
    }
}
