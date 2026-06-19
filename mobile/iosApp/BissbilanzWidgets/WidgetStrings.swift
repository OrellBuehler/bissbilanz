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
