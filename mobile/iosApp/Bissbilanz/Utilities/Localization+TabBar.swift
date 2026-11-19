import Foundation

// Strings for the tab bar editor (`TabSelectionView`), the landing tab, the
// appearance override and the Settings sections that list every screen the
// tab bar can hold. Kept in its own file to avoid merge conflicts in the
// shared Localization.swift; same `localized` helper, re-declared privately.
extension L10n {
    static var tabBarChosenHeader: String {
        localized("tab_bar_chosen_header", en: "In the tab bar", de: "In der Tab-Leiste")
    }

    static var tabBarChosenFooter: String {
        localized(
            "tab_bar_chosen_footer",
            en: "Drag to reorder. Home always comes first and Settings last.",
            de: "Zum Sortieren ziehen. Die Startseite steht immer zuerst, die Einstellungen zuletzt."
        )
    }

    static var tabBarAvailableHeader: String {
        localized("tab_bar_available_header", en: "Available", de: "Verfügbar")
    }

    static func tabBarFullHint(_ max: Int) -> String {
        localized(
            "tab_bar_full_hint",
            en: "The tab bar holds up to \(max) tabs. Remove one to add another.",
            de: "Die Tab-Leiste fasst bis zu \(max) Tabs. Entferne einen, um einen anderen hinzuzufügen."
        )
    }

    static var tabBarRequiresAccount: String {
        localized("tab_bar_requires_account", en: "Requires sign-in", de: "Nur mit Anmeldung")
    }

    static func tabBarAdd(_ name: String) -> String {
        localized("tab_bar_add", en: "Add \(name)", de: "\(name) hinzufügen")
    }

    static func tabBarRemove(_ name: String) -> String {
        localized("tab_bar_remove", en: "Remove \(name)", de: "\(name) entfernen")
    }

    static var openAppOn: String {
        localized("open_app_on", en: "Open app on", de: "Beim Start öffnen")
    }

    static var openAppOnFooter: String {
        localized(
            "open_app_on_footer",
            en: "The tab shown when the app starts.",
            de: "Dieser Tab erscheint, wenn die App startet."
        )
    }

    static var appearance: String {
        localized("appearance", en: "Appearance", de: "Darstellung")
    }

    static var appearanceSystem: String {
        localized("appearance_system", en: "System", de: "System")
    }

    static var appearanceLight: String {
        localized("appearance_light", en: "Light", de: "Hell")
    }

    static var appearanceDark: String {
        localized("appearance_dark", en: "Dark", de: "Dunkel")
    }

    static var settingsSectionFood: String {
        localized("settings_section_food", en: "Food & recipes", de: "Lebensmittel & Rezepte")
    }

    static var settingsSectionAnalysis: String {
        localized("settings_section_analysis", en: "Analysis", de: "Auswertung")
    }

    private static func localized(_ key: String, en: String, de: String) -> String {
        switch currentLocale {
        case .en: en
        case .de: de
        }
    }
}
