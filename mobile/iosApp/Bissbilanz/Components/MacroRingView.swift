import SwiftUI

struct MacroRingView: View {
    /// Short abbreviation shown under the ring ("Cal", "P", "C"...).
    let label: String
    /// Full macro name spoken by VoiceOver instead of the abbreviation.
    let accessibilityName: String
    let current: Double
    let goal: Double
    let macro: AccessibleMacroColor.Macro
    var showGoal: Bool = false
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

    /// Subtle sweep from a muted shade to the full macro color, so the ring
    /// gains depth as it fills without straying from the macro color coding.
    private var ringGradient: AngularGradient {
        AngularGradient(
            gradient: Gradient(colors: [ringColor.opacity(0.65), ringColor]),
            center: .center,
            startAngle: .degrees(0),
            endAngle: .degrees(360)
        )
    }

    private var fillAnimation: Animation {
        .spring(response: 0.8, dampingFraction: 0.85).delay(animationDelay)
    }

    var body: some View {
        VStack(spacing: 4) {
            ZStack {
                Circle()
                    .stroke(color.opacity(trackOpacity), lineWidth: 6)

                Circle()
                    .trim(from: 0, to: animatedProgress)
                    .stroke(ringGradient, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .shadow(color: ringColor.opacity(colorScheme == .dark ? 0.4 : 0.25), radius: 3)

                VStack(spacing: 0) {
                    Text(MacroFormat.kcal(current))
                        .font(.caption)
                        .fontWeight(.semibold)
                        .monospacedDigit()
                        .contentTransition(.numericText(value: current))
                        .foregroundStyle(isOver ? .red : color)
                    if showGoal {
                        Text("/\(MacroFormat.kcal(goal))")
                            .font(.system(size: 8))
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                    }
                }
                .animation(reduceMotion ? nil : fillAnimation, value: current)

                // Color alone marks "over goal" (ring/text turn red) — add a
                // shape-based cue too when Differentiate Without Color is on.
                if isOver, differentiateWithoutColor {
                    Image(systemName: "exclamationmark.circle.fill")
                        .font(.system(size: 12))
                        .foregroundStyle(.red)
                        .background(Circle().fill(.background))
                        .offset(x: 20, y: -20)
                        .accessibilityHidden(true)
                }
            }
            .frame(width: 56, height: 56)

            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .onAppear { syncProgress() }
        .onChange(of: progress) { _, _ in syncProgress() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityName)
        .accessibilityValue(accessibilityValueText)
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
