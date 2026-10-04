import Foundation

/// Strings for on-device photo meal estimation and the "send to assistant"
/// connection gate. Kept in its own file (rather than in `Localization.swift`)
/// to avoid merge conflicts with other in-flight iOS features touching that
/// file at the same time.
extension L10n {
    static var aiTaskNoAssistantConnected: String {
        localizedPhotoMeal(
            en: "No assistant connected — connect Claude or ChatGPT to send meals to it.",
            de: "Kein Assistent verbunden – verbinde Claude oder ChatGPT, um Mahlzeiten an ihn zu senden."
        )
    }

    private static func localizedPhotoMeal(en: String, de: String) -> String {
        switch currentLocale {
        case .en: en
        case .de: de
        }
    }
}
