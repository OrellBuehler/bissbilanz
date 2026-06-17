import SwiftUI

/// Reusable progress ring shared by the watch app and its complication —
/// the watch-side counterpart of the home-screen widgets' `WidgetMacroRing`,
/// using the same muted track, angular-gradient sweep and over-goal red
/// treatment. Pure SwiftUI so it renders in both a live view and a static
/// complication frame.
struct WatchMacroRing: View {
    let value: Double
    let goal: Double
    let color: Color
    var lineWidth: CGFloat = 6
    /// Optional content drawn in the middle of the ring (value, label, icon).
    var center: AnyView?

    @Environment(\.colorScheme) private var colorScheme

    init(value: Double, goal: Double, color: Color, lineWidth: CGFloat = 6) {
        self.value = value
        self.goal = goal
        self.color = color
        self.lineWidth = lineWidth
        center = nil
    }

    init(value: Double, goal: Double, color: Color, lineWidth: CGFloat = 6, @ViewBuilder center: () -> some View) {
        self.value = value
        self.goal = goal
        self.color = color
        self.lineWidth = lineWidth
        self.center = AnyView(center())
    }

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
                .stroke(color.opacity(colorScheme == .dark ? 0.22 : 0.14), lineWidth: lineWidth)

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

            if let center {
                center
            }
        }
    }
}
