import Foundation

extension Double {
    /// Locale-tolerant parse of a user-typed numeric field. Accepts both ','
    /// and '.' as the decimal separator regardless of device locale, because a
    /// `.decimalPad` emits ',' on German-locale devices while `Double("1.5")`
    /// only accepts '.'. Without this, `Double("78,4")` is nil → silent no-op
    /// saves on German keyboards.
    ///
    /// Scope: single user-entered values (weight, calories, macros, servings,
    /// dose, quantity). It does NOT handle thousands separators — for OCR'd
    /// nutrition labels, which can contain grouping separators, use
    /// `NutritionLabelParser.parseDecimal` instead.
    static func parseUserInput(_ text: String) -> Double? {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        if let value = Double(trimmed) {
            return value
        }
        return Double(trimmed.replacingOccurrences(of: ",", with: "."))
    }
}
