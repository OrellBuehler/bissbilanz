import SwiftUI

struct MacroRingView: View {
    let label: String
    let current: Double
    let goal: Double
    let color: Color
    var showGoal: Bool = false
    /// Staggers the fill animation so a row of rings cascades into place.
    var animationDelay: Double = 0

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme

    @State private var animatedProgress: Double = 0

    private var progress: Double {
        guard goal > 0 else { return 0 }
        return min(current / goal, 1.0)
    }

    private var isOver: Bool {
        goal > 0 && current > goal
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
                    .stroke(color.opacity(colorScheme == .dark ? 0.2 : 0.12), lineWidth: 6)

                Circle()
                    .trim(from: 0, to: animatedProgress)
                    .stroke(ringGradient, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .shadow(color: ringColor.opacity(colorScheme == .dark ? 0.4 : 0.25), radius: 3)

                VStack(spacing: 0) {
                    Text("\(Int(current))")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .monospacedDigit()
                        .contentTransition(.numericText(value: current))
                        .foregroundStyle(isOver ? .red : color)
                    if showGoal {
                        Text("/\(Int(goal))")
                            .font(.system(size: 8))
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                    }
                }
                .animation(reduceMotion ? nil : fillAnimation, value: current)
            }
            .frame(width: 56, height: 56)

            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .onAppear { syncProgress() }
        .onChange(of: progress) { _, _ in syncProgress() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityValue(accessibilityValueText)
    }

    private var accessibilityValueText: String {
        goal > 0 ? "\(Int(current)) / \(Int(goal))" : "\(Int(current))"
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
