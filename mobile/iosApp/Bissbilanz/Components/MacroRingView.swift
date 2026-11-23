import SwiftUI

struct MacroRingView: View {
    /// Short abbreviation shown under the ring ("Cal", "P", "C"...).
    let label: String?
    /// Full macro name spoken by VoiceOver instead of the abbreviation.
    let accessibilityName: String
    let current: Double
    let goal: Double
    let macro: AccessibleMacroColor.Macro
    var showGoal: Bool = false
    var size: CGFloat = 56
    /// Staggers the fill animation so a row of rings cascades into place.
    var animationDelay: Double = 0

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityDifferentiateWithoutColor) private var differentiateWithoutColor
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.colorSchemeContrast) private var colorSchemeContrast

    @State private var animatedProgress: Double = 0

    private var progress: Double {
        guard goal > 0 else { return 0 }
        return min(current / goal, 1.0)
    }

    private var isOver: Bool {
        goal > 0 && current > goal
    }

    private var color: Color {
        AccessibleMacroColor.color(macro, colorScheme: colorScheme, contrast: colorSchemeContrast)
    }

    private var ringColor: Color {
        isOver ? .red : color
    }

    private var isLarge: Bool {
        size >= 100
    }

    private var lineWidth: CGFloat {
        size * 0.14
    }

    private var fillAnimation: Animation {
        .spring(response: 0.8, dampingFraction: 0.85).delay(animationDelay)
    }

    var body: some View {
        VStack(spacing: 4) {
            ZStack {
                Circle()
                    .stroke(color.opacity(trackOpacity), lineWidth: lineWidth)

                Circle()
                    .trim(from: 0, to: animatedProgress)
                    .stroke(ringColor, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                    .rotationEffect(.degrees(-90))

                centerText

                // Color alone marks "over goal" (ring/text turn red) — add a
                // shape-based cue too when Differentiate Without Color is on.
                if isOver, differentiateWithoutColor {
                    Image(systemName: "exclamationmark.circle.fill")
                        .font(.caption)
                        .foregroundStyle(.red)
                        .background(Circle().fill(.background))
                        .offset(x: size * 0.36, y: -size * 0.36)
                        .accessibilityHidden(true)
                }
            }
            .frame(width: size, height: size)

            if let label {
                Text(label)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .onAppear { syncProgress() }
        .onChange(of: progress) { _, _ in syncProgress() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityName)
        .accessibilityValue(accessibilityValueText)
    }

    private var centerText: some View {
        VStack(spacing: 0) {
            Text(MacroFormat.kcal(current))
                .font(isLarge ? Font.brand(.title2, weight: .bold) : Font.brand(.caption, weight: .semibold))
                .monospacedDigit()
                .minimumScaleFactor(0.7)
                .lineLimit(1)
                .contentTransition(.numericText(value: current))
                .foregroundStyle(isOver ? .red : color)
            if showGoal {
                Text(goalCaption)
                    .font(isLarge ? Font.brand(.caption) : Font.caption2)
                    .monospacedDigit()
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, lineWidth + 2)
        .animation(reduceMotion ? nil : fillAnimation, value: current)
    }

    private var goalCaption: String {
        isLarge ? "/ \(MacroFormat.kcal(goal)) \(L10n.insightsKcalUnit)" : "/\(MacroFormat.kcal(goal))"
    }

    private var trackOpacity: Double {
        let base = colorScheme == .dark ? 0.2 : 0.12
        return colorSchemeContrast == .increased ? base * 2 : base
    }

    private var accessibilityValueText: String {
        let unit = macro == .calories ? L10n.calories : L10n.gramsUnit
        let value = goal > 0
            ? L10n.progressOfGoal(current: MacroFormat.kcal(current), goal: MacroFormat.kcal(goal), unit: unit)
            : "\(MacroFormat.kcal(current)) \(unit)"
        return isOver ? "\(value), \(L10n.overGoal)" : value
    }

    private func syncProgress() {
        if reduceMotion {
            animatedProgress = progress
        } else {
            withAnimation(fillAnimation) {
                animatedProgress = progress
            }
        }
    }
}
