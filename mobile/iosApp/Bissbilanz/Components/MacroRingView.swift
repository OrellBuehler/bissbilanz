import SwiftUI

struct MacroRingView: View {
    let label: String
    let current: Double
    let goal: Double
    let color: Color
    var showGoal: Bool = false

    private var progress: Double {
        guard goal > 0 else { return 0 }
        return min(current / goal, 1.0)
    }

    private var isOver: Bool {
        goal > 0 && current > goal
    }

    var body: some View {
        VStack(spacing: 4) {
            ZStack {
                Circle()
                    .stroke(color.opacity(0.15), lineWidth: 6)
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(
                        isOver ? Color.red : color,
                        style: StrokeStyle(lineWidth: 6, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))
                    .animation(.easeInOut(duration: 0.5), value: progress)

                VStack(spacing: 0) {
                    Text("\(Int(current))")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundStyle(isOver ? .red : color)
                    if showGoal {
                        Text("/\(Int(goal))")
                            .font(.system(size: 8))
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .frame(width: 56, height: 56)

            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }
}
