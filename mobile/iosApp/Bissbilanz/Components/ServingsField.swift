import SwiftUI

/// Serving multiplier control: a decimal field for exact amounts next to a
/// stepper for quick nudges. The stepper on its own moved in quarters, so
/// portions like 0.2x or a third of a pack were not expressible.
struct ServingsField: View {
    @Binding var servings: Double

    /// Wide enough for any real portion, narrow enough that a mistyped
    /// multiplier can't produce an absurd entry.
    private static let range = 0.01 ... 100.0

    @State private var text = ""
    @FocusState private var isFocused: Bool

    var body: some View {
        HStack {
            Text(L10n.servings)
            Spacer()
            TextField("1", text: $text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .monospacedDigit()
                .focused($isFocused)
                .frame(maxWidth: 72)
            Text("x")
                .foregroundStyle(.secondary)
            Stepper(L10n.servings, value: $servings, in: Self.range, step: 0.25)
                .labelsHidden()
        }
        .onAppear { text = MacroFormat.servings(servings) }
        .onChange(of: text) { _, newValue in
            guard let parsed = Self.parse(newValue) else { return }
            servings = min(max(parsed, Self.range.lowerBound), Self.range.upperBound)
        }
        .onChange(of: servings) { _, newValue in
            // Only rewrite the field when something else moved the value —
            // rewriting it mid-typing would fight the cursor.
            guard Self.parse(text) != newValue else { return }
            text = MacroFormat.servings(newValue)
        }
        .onChange(of: isFocused) { _, focused in
            // Settle the field once editing ends, so a half-typed or empty
            // value doesn't sit there over a multiplier that is actually in
            // effect.
            if !focused { text = MacroFormat.servings(servings) }
        }
    }

    /// Accepts a comma as the decimal separator — a German keyboard's decimal
    /// pad offers one, and `Double.init` won't take it.
    private static func parse(_ text: String) -> Double? {
        Double(text.replacingOccurrences(of: ",", with: "."))
    }
}
