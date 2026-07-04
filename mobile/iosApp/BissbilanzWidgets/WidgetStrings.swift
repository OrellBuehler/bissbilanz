import Foundation

/// Minimal widget-side localization keyed off the snapshot's locale code, so
/// widgets follow the in-app language setting (the extension cannot read the
/// app's `UserDefaults.standard`).
struct WidgetStrings {
    let localeCode: String

    private var isGerman: Bool {
        localeCode == "de"
    }

    var locale: Locale {
        Locale(identifier: localeCode)
    }

    // MARK: - Labels

    var kcalToday: String {
        isGerman ? "kcal heute" : "kcal today"
    }

    var gProtein: String {
        isGerman ? "g Eiweiß" : "g protein"
    }

    var calories: String {
        isGerman ? "Kalorien" : "Calories"
    }

    var protein: String {
        isGerman ? "Eiweiß" : "Protein"
    }

    var carbs: String {
        isGerman ? "KH" : "Carbs"
    }

    var fat: String {
        isGerman ? "Fett" : "Fat"
    }

    var fiber: String {
        isGerman ? "Ballastst." : "Fiber"
    }

    var today: String {
        isGerman ? "Heute" : "Today"
    }

    var logFood: String {
        isGerman ? "Essen eintragen" : "Log food"
    }

    var scan: String {
        isGerman ? "Scannen" : "Scan"
    }

    var weight: String {
        isGerman ? "Gewicht" : "Weight"
    }

    var tapToLog: String {
        isGerman ? "Tippen zum Erfassen" : "Tap to log"
    }

    var noFavorites: String {
        isGerman ? "Noch keine Favoriten" : "No favorites yet"
    }

    var noEntriesYet: String {
        isGerman ? "Noch keine Einträge" : "No entries yet"
    }

    func mealName(_ key: String) -> String {
        switch key.lowercased() {
        case "breakfast": isGerman ? "Frühstück" : "Breakfast"
        case "lunch": isGerman ? "Mittagessen" : "Lunch"
        case "dinner": isGerman ? "Abendessen" : "Dinner"
        case "snacks", "snack": "Snacks"
        default: key.capitalized
        }
    }

    // MARK: - Widget Gallery

    var caloriesWidgetDescription: String {
        isGerman
            ? "Heutige Kalorien im Vergleich zum Tagesziel."
            : "Today's calories against your daily goal."
    }

    var proteinWidgetDescription: String {
        isGerman
            ? "Heutiges Eiweiß im Vergleich zum Tagesziel."
            : "Today's protein against your daily goal."
    }

    var quickWeightWidgetDescription: String {
        isGerman ? "Gewicht heute anzeigen und erfassen." : "See today's weight and log it."
    }

    var quickScanWidgetDisplayName: String {
        isGerman ? "Schnell-Scan" : "Quick Scan"
    }

    var quickScanWidgetDescription: String {
        isGerman ? "Tippen, um den Barcode-Scanner zu öffnen." : "Tap to open the barcode scanner."
    }

    var dayOverviewWidgetDisplayName: String {
        isGerman ? "Tagesübersicht" : "Day Overview"
    }

    var dayOverviewWidgetDescription: String {
        isGerman ? "Mahlzeiten, Makros und schnelles Eintragen." : "Meals, macros and quick logging."
    }

    var macroSummaryWidgetDisplayName: String {
        isGerman ? "Makros" : "Macros"
    }

    var macroSummaryWidgetDescription: String {
        isGerman
            ? "Tägliche Fortschrittsringe für Kalorien, Eiweiß, Kohlenhydrate und Fett."
            : "Daily progress rings for calories, protein, carbs and fat."
    }

    var favoritesWidgetDisplayName: String {
        isGerman ? "Favoriten" : "Favorites"
    }

    var favoritesWidgetDescription: String {
        isGerman
            ? "Lieblingsgerichte mit einem Tippen öffnen und eintragen."
            : "Open and log favorite foods with one tap."
    }

    var quickAddWidgetDisplayName: String {
        isGerman ? "Schnell eintragen" : "Quick Add"
    }

    var quickAddWidgetDescription: String {
        isGerman
            ? "Favoriten mit einem Tippen eintragen — ohne die App zu öffnen."
            : "Log a favorite with one tap — without opening the app."
    }

    // MARK: - Fasting Live Activity

    var fasting: String {
        isGerman ? "Fasten" : "Fasting"
    }

    var endFast: String {
        isGerman ? "Beenden" : "End Fast"
    }

    var elapsed: String {
        isGerman ? "Verstrichen" : "Elapsed"
    }

    var remaining: String {
        isGerman ? "Verbleibend" : "Remaining"
    }

    func fastingTarget(_ hours: Int) -> String {
        isGerman ? "Ziel: \(hours) h" : "Target: \(hours) h"
    }

    func fastingEndsAt(_ date: Date) -> String {
        isGerman ? "Endet um \(time(from: date))" : "Ends \(time(from: date))"
    }

    // MARK: - Formatting

    func integer(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = 0
        formatter.locale = locale
        return formatter.string(from: NSNumber(value: value.rounded())) ?? "0"
    }

    func weightKg(_ value: Double) -> String {
        String(format: "%.1f kg", locale: Locale(identifier: "en_US_POSIX"), value)
    }

    func time(from date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeStyle = .short
        formatter.dateStyle = .none
        return formatter.string(from: date)
    }

    func shortDate(fromIso isoDate: String) -> String? {
        let parser = DateFormatter()
        parser.dateFormat = "yyyy-MM-dd"
        parser.locale = Locale(identifier: "en_US_POSIX")
        guard let date = parser.date(from: isoDate) else { return nil }
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.setLocalizedDateFormatFromTemplate("EEEdMMM")
        return formatter.string(from: date)
    }
}

extension WidgetSnapshot {
    var strings: WidgetStrings {
        WidgetStrings(localeCode: localeCode)
    }
}

/// Deep links the widgets open in the app. Hosts are routed by `DeepLink` on
/// the app side; `today` simply opens the dashboard.
enum WidgetDeepLink {
    static let today = URL(string: "bissbilanz://today")
    static let logFood = URL(string: "bissbilanz://log")
    static let scanner = URL(string: "bissbilanz://scan")
    static let weight = URL(string: "bissbilanz://weight")

    static func food(_ id: String) -> URL? {
        guard let encoded = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) else { return nil }
        return URL(string: "bissbilanz://food/\(encoded)")
    }
}
