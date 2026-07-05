import SwiftUI
import WidgetKit

/// Static counterpart of the app's `MacroRingView` — same muted track,
/// angular-gradient sweep and over-goal treatment, without animation
/// (widgets render still frames).
struct WidgetMacroRing: View {
    let value: Double
    let goal: Double
    let color: Color
    let label: String
    let strings: WidgetStrings
    var size: CGFloat = 52
    var lineWidth: CGFloat = 5

    @Environment(\.colorScheme) private var colorScheme

    private var progress: Double {
        guard goal > 0 else { return 0 }
        return min(value / goal, 1.0)
    }

    private var isOver: Bool {
        goal > 0 && value > goal
    }

    private var ringColor: Color {
        isOver ? .red : color
    }

    var body: some View {
        VStack(spacing: 4) {
            ZStack {
                Circle()
                    .stroke(color.opacity(colorScheme == .dark ? 0.2 : 0.12), lineWidth: lineWidth)

                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(
                        AngularGradient(
                            gradient: Gradient(colors: [ringColor.opacity(0.65), ringColor]),
                            center: .center,
                            startAngle: .degrees(0),
                            endAngle: .degrees(360)
                        ),
                        style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))

                Text(strings.integer(value))
                    .font(.caption)
                    .fontWeight(.semibold)
                    .monospacedDigit()
                    .minimumScaleFactor(0.7)
                    .foregroundStyle(isOver ? .red : color)
                    .padding(.horizontal, lineWidth + 2)
            }
            .frame(width: size, height: size)

            Text(label)
                .font(.caption2)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .foregroundStyle(.secondary)
        }
    }
}

/// Full-bleed progress ring used by the `systemSmall` calories/protein
/// widgets — no fixed frame (fills the widget canvas) and its two-line
/// value/unit label sits inside the ring rather than below it, unlike
/// `WidgetMacroRing`.
struct WidgetRingGauge: View {
    let value: Double
    let goal: Double
    let color: Color
    let valueLabel: String
    let strings: WidgetStrings
    var lineWidth: CGFloat = 8

    @Environment(\.colorScheme) private var colorScheme

    private var progress: Double {
        guard goal > 0 else { return 0 }
        return min(value / goal, 1.0)
    }

    private var isOver: Bool {
        goal > 0 && value > goal
    }

    private var ringColor: Color {
        isOver ? .red : color
    }

    var body: some View {
        ZStack {
            Circle()
                .stroke(color.opacity(colorScheme == .dark ? 0.2 : 0.12), lineWidth: lineWidth)

            Circle()
                .trim(from: 0, to: progress)
                .stroke(
                    AngularGradient(
                        gradient: Gradient(colors: [ringColor.opacity(0.65), ringColor]),
                        center: .center,
                        startAngle: .degrees(0),
                        endAngle: .degrees(360)
                    ),
                    style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))

            VStack(spacing: 2) {
                Text(strings.integer(value))
                    .font(.system(.title2, design: .rounded))
                    .fontWeight(.semibold)
                    .monospacedDigit()
                    .minimumScaleFactor(0.6)
                    .foregroundStyle(isOver ? .red : color)
                Text(valueLabel)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .padding(14)
        }
    }
}

/// Compact value + label column used in the day overview totals row.
struct WidgetMacroValue: View {
    let value: Double
    let label: String
    let color: Color
    let strings: WidgetStrings

    var body: some View {
        VStack(spacing: 2) {
            Text(strings.integer(value))
                .font(.footnote)
                .fontWeight(.semibold)
                .monospacedDigit()
                .foregroundStyle(color)
            Text(label)
                .font(.caption2)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}

extension View {
    /// Standard widget background matching the app's surfaces in both
    /// appearances.
    func bissbilanzWidgetBackground() -> some View {
        containerBackground(for: .widget) {
            Color(.systemBackground)
        }
    }
}
