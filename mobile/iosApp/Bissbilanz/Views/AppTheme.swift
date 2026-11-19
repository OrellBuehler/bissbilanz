import SwiftUI
import UIKit

/// Light or dark regardless of the system setting, picked in Settings and
/// kept on this device only.
enum AppTheme: String, CaseIterable, Identifiable {
    case system
    case light
    case dark

    static let storageKey = "app_theme"

    var id: String {
        rawValue
    }

    var label: String {
        switch self {
        case .system: L10n.appearanceSystem
        case .light: L10n.appearanceLight
        case .dark: L10n.appearanceDark
        }
    }

    var interfaceStyle: UIUserInterfaceStyle {
        switch self {
        case .system: .unspecified
        case .light: .light
        case .dark: .dark
        }
    }
}

extension View {
    /// Applies the stored `AppTheme` to the window this view lives in, so
    /// sheets, alerts and full-screen covers follow it too.
    func appTheme() -> some View {
        modifier(AppThemeModifier())
    }
}

private struct AppThemeModifier: ViewModifier {
    @AppStorage(AppTheme.storageKey) private var themeRaw = AppTheme.system.rawValue

    func body(content: Content) -> some View {
        content.background(WindowInterfaceStyle(style: (AppTheme(rawValue: themeRaw) ?? .system).interfaceStyle))
    }
}

/// Sets the window's `overrideUserInterfaceStyle`, which every presentation
/// in the window inherits; going back to System is a plain `.unspecified`.
private struct WindowInterfaceStyle: UIViewRepresentable {
    let style: UIUserInterfaceStyle

    func makeUIView(context _: Context) -> StyleView {
        let view = StyleView(frame: .zero)
        view.isUserInteractionEnabled = false
        view.style = style
        return view
    }

    func updateUIView(_ uiView: StyleView, context _: Context) {
        uiView.style = style
    }

    final class StyleView: UIView {
        var style: UIUserInterfaceStyle = .unspecified {
            didSet { apply() }
        }

        override func didMoveToWindow() {
            super.didMoveToWindow()
            apply()
        }

        private func apply() {
            window?.overrideUserInterfaceStyle = style
        }
    }
}
