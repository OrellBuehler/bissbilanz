import Foundation

/// Canonical number formatting for macro/nutrient displays, consolidated out
/// of several near-identical ad-hoc implementations across the app and
/// widget extension (both compile `PhoneShared/`).
enum MacroFormat {
    /// Whole number when the value has no fractional part (and stays under
    /// 10,000), otherwise one decimal place. Mirrors the original rule from
    /// `NutrientRow.formattedValue`.
    static func nutrient(_ value: Double) -> String {
        if value == value.rounded(), value < 10000 {
            return "\(Int(value))"
        }
        return String(format: "%.1f", value)
    }

    /// Rounds to the nearest whole number — used for calorie (and other
    /// bare-integer macro) displays.
    static func kcal(_ value: Double) -> String {
        "\(Int(value.rounded()))"
    }

    /// One decimal place with a "kg" suffix. Pass `signed: true` to force a
    /// leading sign on positive values (e.g. weight deltas).
    static func kg(_ value: Double, signed: Bool = false) -> String {
        signed ? String(format: "%+.1f kg", value) : String(format: "%.1f kg", value)
    }

    /// Whole-number percent with a trailing "%". `value` is expected to
    /// already be on a 0-100 scale.
    static func percent(_ value: Double) -> String {
        "\(Int(value))%"
    }
}
