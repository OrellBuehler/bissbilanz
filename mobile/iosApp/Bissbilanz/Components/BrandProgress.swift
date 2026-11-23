import SwiftUI

struct BrandProgressRing: View {
    let progress: Double
    var tint: Color = Brand.accent
    var lineWidth: CGFloat = 12
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var clamped: Double {
        progress.isFinite ? min(max(progress, 0), 1) : 0
    }

    var body: some View {
        ZStack {
            Circle()
                .stroke(tint.opacity(0.16), lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: clamped)
                .stroke(tint, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
        .animation(reduceMotion ? nil : .smooth(duration: 0.6), value: clamped)
        .accessibilityHidden(true)
    }
}

struct BrandProgressBar: View {
    let value: Double
    var tint: Color = Brand.accent
    var height: CGFloat = 8
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var clamped: Double {
        value.isFinite ? min(max(value, 0), 1) : 0
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(tint.opacity(0.16))
                Capsule()
                    .fill(tint)
                    .frame(width: proxy.size.width * clamped)
            }
        }
        .frame(height: height)
        .animation(reduceMotion ? nil : .smooth(duration: 0.5), value: clamped)
        .accessibilityHidden(true)
    }
}
