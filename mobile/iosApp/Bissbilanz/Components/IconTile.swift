import SwiftUI

struct IconTile: View {
    let systemImage: String
    let tint: Color
    @ScaledMetric private var size: CGFloat
    @Environment(\.colorScheme) private var colorScheme

    init(systemImage: String, tint: Color = Brand.accent, size: CGFloat = 36) {
        self.systemImage = systemImage
        self.tint = tint
        _size = ScaledMetric(wrappedValue: size, relativeTo: .body)
    }

    var body: some View {
        Image(systemName: systemImage)
            .font(.system(size: size * 0.45, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: size, height: size)
            .background(
                tint.opacity(colorScheme == .dark ? 0.22 : 0.14),
                in: RoundedRectangle(cornerRadius: size * 0.3, style: .continuous)
            )
            .accessibilityHidden(true)
    }
}
