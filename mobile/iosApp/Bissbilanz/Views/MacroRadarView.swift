import SwiftUI

struct MacroRadarView: View {
    let axes: [(String, Double, Color)] // (label, ratio to goal, color)

    var body: some View {
        GeometryReader { geo in
            let center = CGPoint(x: geo.size.width / 2, y: geo.size.height / 2)
            let radius = min(geo.size.width, geo.size.height) / 2 - 24
            let count = axes.count

            Canvas { context, _ in
                // Draw concentric pentagons (25%, 50%, 75%, 100%)
                for level in [0.25, 0.5, 0.75, 1.0] {
                    let path = polygonPath(center: center, radius: radius * level, sides: count)
                    context.stroke(path, with: .color(.gray.opacity(0.2)), lineWidth: 1)
                }

                // Draw axes
                for i in 0..<count {
                    let angle = angleFor(index: i, total: count)
                    let point = pointAt(center: center, radius: radius, angle: angle)
                    var path = Path()
                    path.move(to: center)
                    path.addLine(to: point)
                    context.stroke(path, with: .color(.gray.opacity(0.15)), lineWidth: 1)
                }

                // Draw filled data polygon
                var dataPath = Path()
                for i in 0..<count {
                    let ratio = min(axes[i].1, 1.5)
                    let angle = angleFor(index: i, total: count)
                    let point = pointAt(center: center, radius: radius * ratio, angle: angle)
                    if i == 0 {
                        dataPath.move(to: point)
                    } else {
                        dataPath.addLine(to: point)
                    }
                }
                dataPath.closeSubpath()

                context.fill(dataPath, with: .color(.blue.opacity(0.15)))
                context.stroke(dataPath, with: .color(.blue), lineWidth: 2)
            }

            // Draw labels
            ForEach(0..<count, id: \.self) { i in
                let angle = angleFor(index: i, total: count)
                let labelRadius = radius + 16
                let point = pointAt(center: center, radius: labelRadius, angle: angle)
                let pct = Int(min(axes[i].1, 2.0) * 100)

                Text("\(axes[i].0)\n\(pct)%")
                    .font(.system(size: 9))
                    .fontWeight(.medium)
                    .foregroundStyle(axes[i].2)
                    .multilineTextAlignment(.center)
                    .position(point)
            }
        }
    }

    private func angleFor(index: Int, total: Int) -> Double {
        let slice = 2 * .pi / Double(total)
        return slice * Double(index) - .pi / 2
    }

    private func pointAt(center: CGPoint, radius: Double, angle: Double) -> CGPoint {
        CGPoint(
            x: center.x + radius * cos(angle),
            y: center.y + radius * sin(angle)
        )
    }

    private func polygonPath(center: CGPoint, radius: Double, sides: Int) -> Path {
        var path = Path()
        for i in 0..<sides {
            let angle = angleFor(index: i, total: sides)
            let point = pointAt(center: center, radius: radius, angle: angle)
            if i == 0 {
                path.move(to: point)
            } else {
                path.addLine(to: point)
            }
        }
        path.closeSubpath()
        return path
    }
}
