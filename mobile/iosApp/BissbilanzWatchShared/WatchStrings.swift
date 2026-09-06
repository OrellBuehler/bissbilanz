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

    var weight: String {
        isGerman ? "Gewicht" : "Weight"
    }

    var sleep: String {
        isGerman ? "Schlaf" : "Sleep"
    }

    var lastNight: String {
        isGerman ? "Letzte Nacht" : "Last night"
    }

    var quality: String {
        isGerman ? "Qualität" : "Quality"
    }

    var byMeal: String {
        isGerman ? "Nach Mahlzeit" : "By meal"
    }

    var sevenDayTrend: String {
        isGerman ? "7-Tage-Trend" : "7-day trend"
    }

    var noWeight: String {
        isGerman ? "Noch kein Gewicht" : "No weight logged yet"
    }

    var noSleep: String {
        isGerman ? "Noch kein Schlaf" : "No sleep logged yet"
    }

    var logged: String {
        isGerman ? "Eingetragen" : "Logged"
    }

    /// Compact "7h 32m" style duration for the sleep glance and logger.
    func sleepDuration(_ minutes: Int) -> String {
        let hours = minutes / 60
        let mins = minutes % 60
        if hours > 0, mins > 0 { return "\(hours)h \(mins)m" }
        if hours > 0 { return "\(hours)h" }
        return "\(mins)m"
    }

    /// Sleep quality on the app's 1–10 scale, e.g. "8/10". Manual entries are
    /// whole numbers; a synced source can carry one decimal ("7.5/10"), which
    /// is kept rather than rounded away.
    func qualityScore(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = 1
        formatter.locale = locale
        let score = formatter.string(from: NSNumber(value: value)) ?? "\(value)"
        return "\(score)/10"
    }

    /// Signed kilogram delta, e.g. "−0.3 kg" / "+0.4 kg".
    func signedKg(_ value: Double) -> String {
        let sign = value > 0 ? "+" : (value < 0 ? "−" : "")
        return "\(sign)\(String(format: "%.1f", locale: Locale(identifier: "en_US_POSIX"), abs(value))) kg"
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
