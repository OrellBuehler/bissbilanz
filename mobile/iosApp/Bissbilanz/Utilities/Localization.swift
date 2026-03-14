import Foundation
import SwiftUI

enum AppLocale: String, CaseIterable {
    case en
    case de

    var displayName: String {
        switch self {
        case .en: return "English"
        case .de: return "Deutsch"
        }
    }
}

// Centralized localization strings
// swiftlint:disable type_body_length
enum L10n {
    // MARK: - General

    static var appName: String { localized("app_name", en: "Bissbilanz", de: "Bissbilanz") }
    static var save: String { localized("save", en: "Save", de: "Speichern") }
    static var cancel: String { localized("cancel", en: "Cancel", de: "Abbrechen") }
    static var delete: String { localized("delete", en: "Delete", de: "Löschen") }
    static var edit: String { localized("edit", en: "Edit", de: "Bearbeiten") }
    static var close: String { localized("close", en: "Close", de: "Schließen") }
    static var add: String { localized("add", en: "Add", de: "Hinzufügen") }
    static var create: String { localized("create", en: "Create", de: "Erstellen") }
    static var search: String { localized("search", en: "Search", de: "Suchen") }
    static var loading: String { localized("loading", en: "Loading...", de: "Laden...") }
    static var retry: String { localized("retry", en: "Retry", de: "Erneut versuchen") }
    static var done: String { localized("done", en: "Done", de: "Fertig") }
    static var today: String { localized("today", en: "Today", de: "Heute") }
    static var log: String { localized("log", en: "Log", de: "Eintragen") }
    static var error: String { localized("error", en: "Error", de: "Fehler") }
    static var ok: String { localized("ok", en: "OK", de: "OK") }

    // MARK: - Tabs

    static var home: String { localized("home", en: "Home", de: "Startseite") }
    static var foods: String { localized("foods", en: "Foods", de: "Lebensmittel") }
    static var favorites: String { localized("favorites", en: "Favorites", de: "Favoriten") }
    static var insights: String { localized("insights", en: "Insights", de: "Einblicke") }
    static var settings: String { localized("settings", en: "Settings", de: "Einstellungen") }

    // MARK: - Meals

    static var breakfast: String { localized("breakfast", en: "Breakfast", de: "Frühstück") }
    static var lunch: String { localized("lunch", en: "Lunch", de: "Mittagessen") }
    static var dinner: String { localized("dinner", en: "Dinner", de: "Abendessen") }
    static var snacks: String { localized("snacks", en: "Snacks", de: "Snacks") }

    static func mealName(_ key: String) -> String {
        switch key.lowercased() {
        case "breakfast": return breakfast
        case "lunch": return lunch
        case "dinner": return dinner
        case "snacks", "snack": return snacks
        default: return key.capitalized
        }
    }

    // MARK: - Macros

    static var calories: String { localized("calories", en: "Calories", de: "Kalorien") }
    static var protein: String { localized("protein", en: "Protein", de: "Eiweiß") }
    static var carbs: String { localized("carbs", en: "Carbs", de: "Kohlenhydrate") }
    static var fat: String { localized("fat", en: "Fat", de: "Fett") }
    static var fiber: String { localized("fiber", en: "Fiber", de: "Ballaststoffe") }

    // MARK: - Dashboard

    static var noEntriesYet: String { localized("no_entries_yet", en: "No entries yet today.", de: "Noch keine Einträge heute.") }
    static var tapToAdd: String { localized("tap_to_add", en: "Tap + to add food.", de: "Tippe + um Essen hinzuzufügen.") }
    static var goToToday: String { localized("go_to_today", en: "Go to Today", de: "Zu Heute") }
    static var copyYesterday: String { localized("copy_yesterday", en: "Copy Yesterday", de: "Gestern kopieren") }

    // MARK: - Foods

    static var searchFoods: String { localized("search_foods", en: "Search foods...", de: "Lebensmittel suchen...") }
    static var recent: String { localized("recent", en: "Recent", de: "Kürzlich") }
    static var noResults: String { localized("no_results", en: "No results", de: "Keine Ergebnisse") }
    static var noRecentFoods: String { localized("no_recent_foods", en: "Foods you log will appear here", de: "Eingetragene Lebensmittel erscheinen hier") }
    static var createFood: String { localized("create_food", en: "Create Food", de: "Lebensmittel erstellen") }
    static var editFood: String { localized("edit_food", en: "Edit Food", de: "Lebensmittel bearbeiten") }
    static var servingSize: String { localized("serving_size", en: "Serving Size", de: "Portionsgröße") }
    static var brand: String { localized("brand", en: "Brand", de: "Marke") }
    static var barcode: String { localized("barcode", en: "Barcode", de: "Barcode") }

    // MARK: - Nutrition

    static var mainMacros: String { localized("main_macros", en: "Main Macros", de: "Hauptnährstoffe") }
    static var fatBreakdown: String { localized("fat_breakdown", en: "Fat Breakdown", de: "Fettaufschlüsselung") }
    static var sugarsCarbs: String { localized("sugars_carbs", en: "Sugars & Carbs", de: "Zucker & Kohlenhydrate") }
    static var minerals: String { localized("minerals", en: "Minerals", de: "Mineralstoffe") }
    static var vitamins: String { localized("vitamins", en: "Vitamins", de: "Vitamine") }
    static var other: String { localized("other", en: "Other", de: "Sonstige") }
    static var nutrition: String { localized("nutrition", en: "Nutrition", de: "Nährwerte") }
    static var quality: String { localized("quality", en: "Quality", de: "Qualität") }
    static var ingredients: String { localized("ingredients", en: "Ingredients", de: "Zutaten") }
    static var nutriScore: String { localized("nutri_score", en: "Nutri-Score", de: "Nutri-Score") }
    static var novaGroup: String { localized("nova_group", en: "NOVA Group", de: "NOVA-Gruppe") }
    static var logged: String { localized("logged", en: "logged", de: "eingetragen") }
    static var failedToLog: String { localized("failed_to_log", en: "Failed to log", de: "Eintragung fehlgeschlagen") }

    // MARK: - Entries

    static var logFood: String { localized("log_food", en: "Log Food", de: "Essen eintragen") }
    static var servings: String { localized("servings", en: "Servings", de: "Portionen") }
    static var meal: String { localized("meal", en: "Meal", de: "Mahlzeit") }
    static var quickEntry: String { localized("quick_entry", en: "Quick Entry", de: "Schnelleintrag") }
    static var editEntry: String { localized("edit_entry", en: "Edit Entry", de: "Eintrag bearbeiten") }
    static var logRecipe: String { localized("log_recipe", en: "Log Recipe", de: "Rezept eintragen") }
    static var noEntries: String { localized("no_entries", en: "No entries", de: "Keine Einträge") }
    static var noFavorites: String { localized("no_favorites", en: "No favorites", de: "Keine Favoriten") }
    static var markFavoritesHint: String { localized("mark_favorites_hint", en: "Mark foods as favorites to see them here", de: "Markiere Lebensmittel als Favoriten") }
    static var markRecipeFavoritesHint: String { localized("mark_recipe_favorites_hint", en: "Mark recipes as favorites to see them here", de: "Markiere Rezepte als Favoriten") }
    static var addFood: String { localized("add_food", en: "Add Food", de: "Essen hinzufügen") }

    // MARK: - Recipes

    static var recipes: String { localized("recipes", en: "Recipes", de: "Rezepte") }
    static var createRecipe: String { localized("create_recipe", en: "Create Recipe", de: "Rezept erstellen") }
    static var editRecipe: String { localized("edit_recipe", en: "Edit Recipe", de: "Rezept bearbeiten") }
    static var totalServings: String { localized("total_servings", en: "Total Servings", de: "Gesamtportionen") }
    static var perServing: String { localized("per_serving", en: "Per Serving", de: "Pro Portion") }
    static var totals: String { localized("totals", en: "Totals", de: "Gesamt") }
    static var addIngredient: String { localized("add_ingredient", en: "Add Ingredient", de: "Zutat hinzufügen") }

    // MARK: - Goals

    static var goals: String { localized("goals", en: "Goals", de: "Ziele") }
    static var editGoals: String { localized("edit_goals", en: "Edit Goals", de: "Ziele bearbeiten") }
    static var dailyGoals: String { localized("daily_goals", en: "Daily Goals", de: "Tagesziele") }

    // MARK: - Weight

    static var weight: String { localized("weight", en: "Weight", de: "Gewicht") }
    static var logWeight: String { localized("log_weight", en: "Log Weight", de: "Gewicht eintragen") }
    static var current: String { localized("current", en: "Current", de: "Aktuell") }
    static var change: String { localized("change", en: "Change", de: "Änderung") }
    static var history: String { localized("history", en: "History", de: "Verlauf") }
    static var trend: String { localized("trend", en: "Trend", de: "Trend") }

    // MARK: - Supplements

    static var supplements: String { localized("supplements", en: "Supplements", de: "Nahrungsergänzung") }
    static var createSupplement: String { localized("create_supplement", en: "Create Supplement", de: "Supplement erstellen") }
    static var editSupplement: String { localized("edit_supplement", en: "Edit Supplement", de: "Supplement bearbeiten") }
    static var daily: String { localized("daily", en: "Daily", de: "Täglich") }
    static var everyOtherDay: String { localized("every_other_day", en: "Every other day", de: "Jeden zweiten Tag") }
    static var weekly: String { localized("weekly", en: "Weekly", de: "Wöchentlich") }
    static var custom: String { localized("custom", en: "Custom", de: "Benutzerdefiniert") }
    static var morning: String { localized("morning", en: "Morning", de: "Morgens") }
    static var noon: String { localized("noon", en: "Noon", de: "Mittags") }
    static var evening: String { localized("evening", en: "Evening", de: "Abends") }
    static var anytime: String { localized("anytime", en: "Anytime", de: "Jederzeit") }
    static var supplementHistory: String { localized("supplement_history", en: "Supplement History", de: "Supplement-Verlauf") }
    static var adherence: String { localized("adherence", en: "Adherence", de: "Einhaltung") }

    // MARK: - Insights

    static var streaks: String { localized("streaks", en: "Streaks", de: "Serien") }
    static var currentStreak: String { localized("current_streak", en: "Current", de: "Aktuell") }
    static var longestStreak: String { localized("longest_streak", en: "Longest", de: "Längste") }
    static var weeklyAvg: String { localized("weekly_avg", en: "Weekly Average", de: "Wochendurchschnitt") }
    static var monthlyAvg: String { localized("monthly_avg", en: "Monthly Average", de: "Monatsdurchschnitt") }
    static var topFoods: String { localized("top_foods", en: "Top Foods", de: "Top-Lebensmittel") }
    static var mealBreakdown: String { localized("meal_breakdown", en: "Meal Breakdown", de: "Mahlzeitenverteilung") }
    static var caloriesTrend: String { localized("calories_trend", en: "Calorie Trend", de: "Kalorientrend") }
    static var macroTrends: String { localized("macro_trends", en: "Macro Trends", de: "Makro-Trends") }
    static var goalAchievement: String { localized("goal_achievement", en: "Goal Achievement", de: "Zielerreichung") }
    static var daysWithinGoal: String { localized("days_within_goal", en: "Days within goal range", de: "Tage im Zielbereich") }
    static var dayPeriod: String { localized("day_period", en: "day period", de: "Tage Zeitraum") }
    static var avgComparison: String { localized("avg_comparison", en: "Average Comparison", de: "Durchschnittsvergleich") }
    static var quickActions: String { localized("quick_actions", en: "Quick Actions", de: "Schnellaktionen") }
    static var favoriteLogging: String { localized("favorite_logging", en: "Favorite Logging", de: "Favoriten-Eintragung") }
    static var autoAssignByTime: String { localized("auto_assign_by_time", en: "Auto-assign by time", de: "Automatisch nach Uhrzeit") }
    static var alwaysAsk: String { localized("always_ask", en: "Always ask", de: "Immer nachfragen") }
    static var quickLog: String { localized("quick_log", en: "Quick Log", de: "Schnelleintrag") }
    static var additives: String { localized("additives", en: "Additives", de: "Zusatzstoffe") }
    static var inactive: String { localized("inactive", en: "Inactive", de: "Inaktiv") }

    // MARK: - Calendar

    static var calendar: String { localized("calendar", en: "Calendar", de: "Kalender") }
    static var daysLogged: String { localized("days_logged", en: "Days Logged", de: "Tage eingetragen") }
    static var daysOnTarget: String { localized("days_on_target", en: "Days on Target", de: "Tage im Ziel") }

    // MARK: - Maintenance

    static var maintenance: String { localized("maintenance", en: "Maintenance", de: "Erhaltung") }
    static var maintenanceCalories: String { localized("maintenance_calories", en: "Maintenance Calories", de: "Erhaltungskalorien") }
    static var calculate: String { localized("calculate", en: "Calculate", de: "Berechnen") }
    static var period: String { localized("period", en: "Period", de: "Zeitraum") }
    static var weeks: String { localized("weeks", en: "weeks", de: "Wochen") }
    static var bodyComposition: String { localized("body_composition", en: "Body Composition", de: "Körperzusammensetzung") }
    static var dataCoverage: String { localized("data_coverage", en: "Data Coverage", de: "Datenabdeckung") }

    // MARK: - Settings

    static var signOut: String { localized("sign_out", en: "Sign Out", de: "Abmelden") }
    static var signOutConfirmation: String { localized("sign_out_confirmation", en: "You will need to sign in again to use the app.", de: "Du musst dich erneut anmelden, um die App zu nutzen.") }
    static var account: String { localized("account", en: "Account", de: "Konto") }
    static var about: String { localized("about", en: "About", de: "Über") }
    static var version: String { localized("version", en: "Version", de: "Version") }
    static var language: String { localized("language", en: "Language", de: "Sprache") }
    static var customMealTypes: String { localized("custom_meal_types", en: "Custom Meal Types", de: "Eigene Mahlzeittypen") }
    static var visibleNutrients: String { localized("visible_nutrients", en: "Visible Nutrients", de: "Sichtbare Nährstoffe") }
    static var dashboardWidgets: String { localized("dashboard_widgets", en: "Dashboard Widgets", de: "Dashboard-Widgets") }
    static var favoriteBehavior: String { localized("favorite_behavior", en: "Favorite Behavior", de: "Favoriten-Verhalten") }
    static var healthKit: String { localized("health_kit", en: "Health Integration", de: "Health-Integration") }

    // MARK: - Scanner

    static var scanBarcode: String { localized("scan_barcode", en: "Scan Barcode", de: "Barcode scannen") }
    static var lookingUp: String { localized("looking_up", en: "Looking up barcode...", de: "Barcode wird gesucht...") }
    static var notFound: String { localized("not_found", en: "No food found for this barcode", de: "Kein Lebensmittel für diesen Barcode gefunden") }
    static var cameraRequired: String { localized("camera_required", en: "Camera access required", de: "Kamerazugriff erforderlich") }
    static var openSettings: String { localized("open_settings", en: "Open Settings", de: "Einstellungen öffnen") }
    static var enableCameraHint: String { localized("enable_camera_hint", en: "Enable camera access in Settings to scan barcodes.", de: "Aktiviere den Kamerazugriff in den Einstellungen, um Barcodes zu scannen.") }
    static var createFoodForBarcode: String { localized("create_food_for_barcode", en: "Create food for this barcode", de: "Lebensmittel für diesen Barcode erstellen") }

    // MARK: - Login

    static var trackNutrition: String { localized("track_nutrition", en: "Track your nutrition", de: "Verfolge deine Ernährung") }
    static var signIn: String { localized("sign_in", en: "Sign in", de: "Anmelden") }

    // MARK: - Private

    @AppStorage("app_locale") private static var storedLocale: String = ""

    static var currentLocale: AppLocale {
        get {
            AppLocale(rawValue: storedLocale) ?? .en
        }
        set {
            storedLocale = newValue.rawValue
        }
    }

    private static func localized(_ key: String, en: String, de: String) -> String {
        switch currentLocale {
        case .en: return en
        case .de: return de
        }
    }
}
// swiftlint:enable type_body_length
