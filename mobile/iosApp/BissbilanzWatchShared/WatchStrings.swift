import Foundation

/// Minimal watch-side localization keyed off the synced snapshot's locale
/// code, so the watch app and complication follow the in-app language. The
/// watch targets can't read the phone app's `UserDefaults.standard`, so the
/// language rides along in the synced state (mirrors the widgets'
/// `WidgetStrings`).
struct WatchStrings {
    let localeCode: String

    private var isGerman: Bool {
        localeCode == "de"
    }

    var locale: Locale {
        Locale(identifier: localeCode)
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
        isGerman ? "Ballast." : "Fiber"
    }

    var kcal: String {
        "kcal"
    }

    var today: String {
        isGerman ? "Heute" : "Today"
    }

    var log: String {
        isGerman ? "Eintragen" : "Log"
    }

    var favorites: String {
        isGerman ? "Favoriten" : "Favorites"
    }

    var recents: String {
        isGerman ? "Zuletzt" : "Recents"
    }

    var meal: String {
        isGerman ? "Mahlzeit" : "Meal"
    }

    var servings: String {
        isGerman ? "Portionen" : "Servings"
    }

    var noData: String {
        isGerman ? "Keine Daten — App auf dem iPhone öffnen" : "No data — open the app on your iPhone"
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

    func integer(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = 0
        formatter.locale = locale
        return formatter.string(from: NSNumber(value: value.rounded())) ?? "0"
    }

    /// Trims trailing zeros so 1.0 → "1" and 1.25 → "1.25".
    func servingsValue(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = 2
        formatter.locale = locale
        return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
    }
}

extension WatchState {
    var strings: WatchStrings {
        WatchStrings(localeCode: snapshot.localeCode)
    }
}
