import Foundation

/// Value-label strings for the macro widget's `small` family, one per
/// `MacroKindAppEnum` case — added alongside `AppIntentConfiguration` support
/// (`MacroWidgetSupport.swift`). Kept in a new file rather than editing
/// `WidgetStrings.swift` directly to avoid clashing with unrelated widget
/// string additions landing in the same file from other in-flight branches.
extension WidgetStrings {
    // `isGerman` on `WidgetStrings` is `private` to its own file, so this
    // recomputes the same check from `localeCode` rather than editing that
    // file just to relax its access level.
    private var isGermanLocale: Bool {
        localeCode == "de"
    }

    var gCarbsToday: String {
        isGermanLocale ? "g KH heute" : "g carbs today"
    }

    var gFatToday: String {
        isGermanLocale ? "g Fett heute" : "g fat today"
    }

    var gFiberToday: String {
        isGermanLocale ? "g Ballaststoffe heute" : "g fiber today"
    }
}
