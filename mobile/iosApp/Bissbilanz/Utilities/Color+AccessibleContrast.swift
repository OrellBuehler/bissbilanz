import SwiftUI
import UIKit

extension Color {
    /// Under Increase Contrast, darkens a status/tint color used as text in
    /// light mode and brightens it slightly in dark mode. The default
    /// appearance is left unchanged.
    func accessibleForeground(colorScheme: ColorScheme, contrast: ColorSchemeContrast) -> Color {
        var hue: CGFloat = 0
        var saturation: CGFloat = 0
        var brightness: CGFloat = 0
        var alpha: CGFloat = 0
        guard UIColor(self).getHue(&hue, saturation: &saturation, brightness: &brightness, alpha: &alpha) else {
            return self
        }
        guard contrast == .increased else { return self }
        switch colorScheme {
        case .dark:
            return Color(hue: hue, saturation: saturation, brightness: min(brightness * 1.15, 1), opacity: alpha)
        default:
            return Color(hue: hue, saturation: saturation, brightness: brightness * 0.55, opacity: alpha)
        }
    }
}
