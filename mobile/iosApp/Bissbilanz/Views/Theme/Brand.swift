import SwiftUI
import UIKit

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }

    static func adaptive(light: UInt32, dark: UInt32, lightHigh: UInt32? = nil, darkHigh: UInt32? = nil) -> Color {
        Color(
            uiColor: UIColor { traits in
                let isDark = traits.userInterfaceStyle == .dark
                let isHigh = traits.accessibilityContrast == .high
                let hex: UInt32
                if isDark {
                    hex = isHigh ? (darkHigh ?? dark) : dark
                } else {
                    hex = isHigh ? (lightHigh ?? light) : light
                }
                return UIColor(
                    red: CGFloat((hex >> 16) & 0xFF) / 255,
                    green: CGFloat((hex >> 8) & 0xFF) / 255,
                    blue: CGFloat(hex & 0xFF) / 255,
                    alpha: 1
                )
            }
        )
    }
}

extension Font {
    static func brand(_ style: Font.TextStyle, weight: Font.Weight = .regular) -> Font {
        .system(style, design: .rounded, weight: weight)
    }
}

/// Design tokens shared with the Android theme (`Theme.kt`); the blue brand
/// and its neutral tones mirror the Material scheme values there.
enum Brand {
    static let accent = Color.adaptive(light: 0x2563EB, dark: 0x93C5FD)
    static let onAccent = Color.adaptive(light: 0xFFFFFF, dark: 0x0B2545)
    static let success = Color.adaptive(light: 0x15803D, dark: 0x86EFAC)
    static let error = Color.adaptive(light: 0xDC2626, dark: 0xFCA5A5)

    static let background = Color.adaptive(light: 0xF7F9FB, dark: 0x0B0E11)
    static let surface = Color.adaptive(light: 0xFFFFFF, dark: 0x1A1F24)
    static let surfaceMuted = Color.adaptive(light: 0xF1F4F7, dark: 0x242A30)
    static let hairline = Color.adaptive(light: 0xC9D1D9, dark: 0x3F484F, lightHigh: 0x79838D, darkHigh: 0x8A939D)
    static let text = Color.adaptive(light: 0x1B2329, dark: 0xE4E9ED)
    static let textSecondary = Color.adaptive(light: 0x4A5560, dark: 0xBEC8D2)

    enum Radius {
        static let card: CGFloat = 24
        static let control: CGFloat = 16
        static let tile: CGFloat = 12
        static let field: CGFloat = 12
    }

    enum Spacing {
        static let screen: CGFloat = 16
        static let section: CGFloat = 20
        static let stack: CGFloat = 12
        static let card: CGFloat = 16
        static let compact: CGFloat = 12
        static let tight: CGFloat = 8
    }
}
