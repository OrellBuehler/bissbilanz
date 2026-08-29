import Foundation
import shared

/// Number formatting for the insight cards.
///
/// Matches Android's card formatting (`roundToInt()`, `"%.1f"`, `"%.2f"`), which
/// is deliberately locale-independent: the two platforms are compared value for
/// value during parity checks, and a decimal comma on one side makes that
/// needlessly hard to read.
extension Double {
    /// Rounded to a whole number, e.g. `42`.
    var rounded0: Int { Int((isFinite ? self : 0).rounded()) }

    /// One decimal place, e.g. `4.2`.
    var rounded1: String { String(format: "%.1f", isFinite ? self : 0) }

    /// Two decimal places, e.g. `0.42`.
    var rounded2: String { String(format: "%.2f", isFinite ? self : 0) }

    /// Two decimals with an explicit sign, e.g. `+0.42` / `-0.42`.
    var signedRounded2: String { String(format: "%@%.2f", self > 0 ? "+" : "", isFinite ? self : 0) }

    /// One decimal with an explicit sign, e.g. `+0.4` / `-0.4`.
    var signedRounded1: String { String(format: "%@%.1f", self >= 0 ? "+" : "", isFinite ? self : 0) }

    /// The `"+"` a card prepends to a non-negative rate; empty otherwise, because
    /// the number already carries its own minus sign.
    var plusSign: String { self >= 0 ? "+" : "" }
}

extension [KotlinInt: KotlinDouble] {
    /// Unboxes a Kotlin `Map<Int, Double>` into native Swift types.
    var swiftDoubles: [Int: Double] {
        var unboxed: [Int: Double] = [:]
        for (key, value) in self { unboxed[Int(truncating: key)] = value.doubleValue }
        return unboxed
    }
}

extension String {
    /// Uppercases the first character only — the shared analytics' fallback for a
    /// token string no card has a translation for (mirrors Kotlin's
    /// `replaceFirstChar { it.uppercase() }`).
    var capitalizedFirst: String { prefix(1).uppercased() + dropFirst() }
}
