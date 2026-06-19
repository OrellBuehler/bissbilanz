import SwiftUI

// iOS 26 Liquid Glass adoption is double-gated: `#if compiler(>=6.2)` keeps
// the project building with pre-iOS-26 SDKs (Xcode 16 locally and in the
// CodeQL job), and `#available(iOS 26.0, *)` keeps the pre-26 appearance as
// the runtime fallback on older systems.

/// Groups floating glass controls so their shapes blend during transitions
/// on iOS 26. Renders the content unchanged on older versions.
struct FloatingControlGroup<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            GlassEffectContainer { content }
        } else {
            content
        }
        #else
        content
        #endif
    }
}

extension View {
    /// Chrome for a circular floating button: interactive Liquid Glass on
    /// iOS 26, a material or tinted circle with shadow before.
    @ViewBuilder
    func circularGlassBackground(tint: Color? = nil) -> some View {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            if let tint {
                glassEffect(.regular.tint(tint).interactive(), in: .circle)
            } else {
                glassEffect(.regular.interactive(), in: .circle)
            }
        } else {
            legacyCircularBackground(tint: tint)
        }
        #else
        legacyCircularBackground(tint: tint)
        #endif
    }

    /// Lets the tab bar minimize while scrolling down on iOS 26; no-op before.
    @ViewBuilder
    func minimizableTabBar() -> some View {
        #if compiler(>=6.2)
        if #available(iOS 26.0, *) {
            tabBarMinimizeBehavior(.onScrollDown)
        } else {
            self
        }
        #else
        self
        #endif
    }
}

private extension View {
    @ViewBuilder
    func legacyCircularBackground(tint: Color?) -> some View {
        if let tint {
            background(tint)
                .clipShape(Circle())
                .shadow(radius: 4)
        } else {
            background(.thinMaterial)
                .clipShape(Circle())
        }
    }
}
