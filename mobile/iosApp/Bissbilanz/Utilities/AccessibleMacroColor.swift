import SwiftUI

/// Contrast-aware macro colors. The base hues in `MacroColors` are tuned for
/// large fills (rings, bars, chart strokes) and fall short of WCAG AA for
/// *text* against light backgrounds; they also never react to Increase
/// Contrast. Views that show a macro color as text or as a small icon read
/// through here instead. The default appearance keeps the base hues; the
/// darker/brighter variants only apply under Increase Contrast.
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
            base(macro)
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
