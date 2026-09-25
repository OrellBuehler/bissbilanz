import SwiftUI
import UIKit

extension Color {
    /// Darkens an arbitrary status/tint color for use as text against a light
    /// card background — the saturated brand hues used throughout Insights
    /// (fiber/carbs/protein as good/medium/bad) fall short of WCAG AA there —
    /// and pushes further under Increase Contrast. Dark mode already reads
    /// well with these hues, so it's left alone except under Increase
    /// Contrast, where it brightens slightly instead.
    func accessibleForeground(colorScheme: ColorScheme, contrast: ColorSchemeContrast) -> Color {
        var hue: CGFloat = 0
        var saturation: CGFloat = 0
        var brightness: CGFloat = 0
        var alpha: CGFloat = 0
        guard UIColor(self).getHue(&hue, saturation: &saturation, brightness: &brightness, alpha: &alpha) else {
            return self
        }
        let isIncreased = contrast == .increased
        switch colorScheme {
        case .dark:
            guard isIncreased else { return self }
            return Color(hue: hue, saturation: saturation, brightness: min(brightness * 1.15, 1), opacity: alpha)
        default:
            let factor: CGFloat = isIncreased ? 0.55 : 0.78
            return Color(hue: hue, saturation: saturation, brightness: brightness * factor, opacity: alpha)
        }
    }
}
