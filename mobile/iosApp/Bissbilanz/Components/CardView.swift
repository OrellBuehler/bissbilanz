import SwiftUI

/// Generic card container — shared by `InsightsView` and `MaintenanceView`.
struct CardView<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .card()
    }
}

struct CardSurface: ViewModifier {
    var radius: CGFloat
    var fill: Color
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.colorSchemeContrast) private var colorSchemeContrast

    private var hairlineOpacity: Double {
        if colorSchemeContrast == .increased { return 1 }
        return colorScheme == .dark ? 1 : 0.6
    }

    func body(content: Content) -> some View {
        content
            .background(fill, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(Brand.hairline.opacity(hairlineOpacity), lineWidth: 1)
            }
            .shadow(color: Color.black.opacity(colorScheme == .dark ? 0 : 0.05), radius: 14, x: 0, y: 6)
            .contentShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    }
}

extension View {
    /// The brand surface without padding, for content that manages its own insets.
    func cardSurface(radius: CGFloat = Brand.Radius.card, fill: Color = Brand.surface) -> some View {
        modifier(CardSurface(radius: radius, fill: fill))
    }

    /// Padding plus the brand surface: solid fill, hairline border, soft shadow in light mode.
    func card(
        padding: CGFloat = Brand.Spacing.card,
        radius: CGFloat = Brand.Radius.card,
        fill: Color = Brand.surface
    ) -> some View {
        self.padding(padding)
            .cardSurface(radius: radius, fill: fill)
    }
}
