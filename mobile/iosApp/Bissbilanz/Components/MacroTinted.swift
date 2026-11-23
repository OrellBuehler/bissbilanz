import SwiftUI

struct MacroTinted<Content: View>: View {
    let macro: AccessibleMacroColor.Macro
    @ViewBuilder let content: (Color) -> Content

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.colorSchemeContrast) private var colorSchemeContrast

    var body: some View {
        content(AccessibleMacroColor.color(macro, colorScheme: colorScheme, contrast: colorSchemeContrast))
    }
}
