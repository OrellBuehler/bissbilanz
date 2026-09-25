import SwiftUI

/// Contrast-aware macro colors. The base hues in `MacroColors` are tuned for
/// large fills (rings, bars, chart strokes) and fall short of WCAG AA for
/// *text* against light backgrounds; they also never react to Increase
/// Contrast. Views that show a macro color as text or as a small icon read
/// through here instead, so the color itself stays legible in every mode.
enum AccessibleMacroColor {
    enum Macro: CaseIterable {
        case calories, protein, carbs, fat, fiber, fasting, water, activity
    }

    static func color(_ macro: Macro, colorScheme: ColorScheme, contrast: ColorSchemeContrast) -> Color {
        switch (colorScheme, contrast) {
        case (.dark, .increased):
            darkIncreased(macro)
        case (.dark, _):
            base(macro)
        case (_, .increased):
            lightIncreased(macro)
        default:
            lightDefault(macro)
        }
    }

    static func base(_ macro: Macro) -> Color {
        switch macro {
        case .calories: MacroColors.calories
        case .protein: MacroColors.protein
        case .carbs: MacroColors.carbs
        case .fat: MacroColors.fat
        case .fiber: MacroColors.fiber
        case .fasting: MacroColors.fasting
        case .water: MacroColors.water
        case .activity: MacroColors.activity
        }
    }

    /// AA-safe (>=4.5:1) against light card backgrounds — the base hues above
    /// mostly fall between 2:1 and 4:1 there.
    private static func lightDefault(_ macro: Macro) -> Color {
        switch macro {
        case .calories: Color(red: 0.192, green: 0.424, blue: 0.800) // #316CCC
        case .protein: Color(red: 0.788, green: 0.224, blue: 0.224) // #C93939
        case .carbs: Color(red: 0.702, green: 0.325, blue: 0.063) // #B35310
        case .fat: Color(red: 0.541, green: 0.416, blue: 0.020) // #8A6A05
        case .fiber: Color(red: 0.086, green: 0.494, blue: 0.235) // #167E3C
        case .fasting: Color(red: 0.361, green: 0.373, blue: 0.878) // #5C5FE0
        case .water: Color(red: 0.016, green: 0.478, blue: 0.557) // #047A8E
        case .activity: Color(red: 0.490, green: 0.325, blue: 0.867) // #7D53DD
        }
    }

    /// ~7:1 against light card backgrounds, for Increase Contrast.
    private static func lightIncreased(_ macro: Macro) -> Color {
        switch macro {
        case .calories: Color(red: 0.141, green: 0.310, blue: 0.588) // #244F96
        case .protein: Color(red: 0.592, green: 0.169, blue: 0.169) // #972B2B
        case .carbs: Color(red: 0.518, green: 0.239, blue: 0.047) // #843D0C
        case .fat: Color(red: 0.396, green: 0.302, blue: 0.012) // #654D03
        case .fiber: Color(red: 0.063, green: 0.373, blue: 0.176) // #105F2D
        case .fasting: Color(red: 0.267, green: 0.275, blue: 0.651) // #4446A6
        case .water: Color(red: 0.012, green: 0.349, blue: 0.408) // #035968
        case .activity: Color(red: 0.361, green: 0.239, blue: 0.635) // #5C3DA2
        }
    }

    /// Brightened past the base hues for Increase Contrast in dark mode —
    /// most base hues already clear 4.5:1 there, so only the ones that don't
    /// (calories, protein, fasting, activity) get a distinct variant.
    private static func darkIncreased(_ macro: Macro) -> Color {
        switch macro {
        case .calories: Color(red: 0.329, green: 0.573, blue: 0.969) // #5492F7
        case .protein: Color(red: 0.949, green: 0.400, blue: 0.400) // #F26666
        case .carbs: MacroColors.carbs
        case .fat: MacroColors.fat
        case .fiber: MacroColors.fiber
        case .fasting: Color(red: 0.522, green: 0.533, blue: 0.957) // #8588F4
        case .water: MacroColors.water
        case .activity: Color(red: 0.635, green: 0.490, blue: 0.973) // #A27DF8
        }
    }
}
