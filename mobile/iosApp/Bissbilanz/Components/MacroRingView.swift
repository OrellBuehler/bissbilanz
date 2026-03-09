import SwiftUI

struct MacroRingView: View {
    let label: String
    let current: Double
    let goal: Double
    let color: Color

    private var progress: Double {
        guard goal > 0 else { return 0 }
        return min(current / goal, 1.0)
    }

    var body: some View {
        VStack(spacing: 4) {
            ZStack {
                Circle()
                    .stroke(color.opacity(0.2), lineWidth: 6)
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(color, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                    .rotationEffect(.degrees(-90))

                Text("\(Int(current))")
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundColor(color)
            }
            .frame(width: 56, height: 56)

            Text(label)
                .font(.caption2)
                .foregroundColor(.secondary)
        }
    }
}
