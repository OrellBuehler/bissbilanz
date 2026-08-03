import Foundation

enum AppLocale: String, CaseIterable {
    case en
    case de

    var displayName: String {
        switch self {
        case .en: "English"
        case .de: "Deutsch"
        }
    }
}

// Centralized localization strings
// swiftlint:disable type_body_length
enum L10n {
    // MARK: - General

    static var appName: String {
        localized("app_name", en: "Bissbilanz", de: "Bissbilanz")
    }

    static var save: String {
        localized("save", en: "Save", de: "Speichern")
    }

    static var cancel: String {
        localized("cancel", en: "Cancel", de: "Abbrechen")
    }

    static var delete: String {
        localized("delete", en: "Delete", de: "Löschen")
    }

    static var edit: String {
        localized("edit", en: "Edit", de: "Bearbeiten")
    }

    static var close: String {
        localized("close", en: "Close", de: "Schließen")
    }

    static var add: String {
        localized("add", en: "Add", de: "Hinzufügen")
    }

    static var create: String {
        localized("create", en: "Create", de: "Erstellen")
    }

    static var search: String {
        localized("search", en: "Search", de: "Suchen")
    }

    static var loading: String {
        localized("loading", en: "Loading...", de: "Laden...")
    }

    static var retry: String {
        localized("retry", en: "Retry", de: "Erneut versuchen")
    }

    static var name: String {
        localized("name", en: "Name", de: "Name")
    }

    static var favorite: String {
        localized("favorite", en: "Favorite", de: "Favorit")
    }

    static var active: String {
        localized("active", en: "Active", de: "Aktiv")
    }

    static var type: String {
        localized("type", en: "Type", de: "Typ")
    }

    static var unit: String {
        localized("unit", en: "Unit", de: "Einheit")
    }

    static var dose: String {
        localized("dose", en: "Dose", de: "Dosis")
    }

    static var schedule: String {
        localized("schedule", en: "Schedule", de: "Zeitplan")
    }

    static var timeOfDay: String {
        localized("time_of_day", en: "Time of Day", de: "Tageszeit")
    }

    static var recipeName: String {
        localized("recipe_name", en: "Recipe Name", de: "Rezeptname")
    }

    static var selectFood: String {
        localized("select_food", en: "Select Food", de: "Lebensmittel auswählen")
    }

    static var somethingWentWrong: String {
        localized("something_went_wrong", en: "Something went wrong", de: "Etwas ist schiefgelaufen")
    }

    static var couldNotRefresh: String {
        localized(
            "could_not_refresh",
            en: "Couldn't reach the server, so this day may be out of date. Pull to refresh or tap retry.",
            de: "Server nicht erreichbar – dieser Tag ist evtl. nicht aktuell. Zum Aktualisieren ziehen oder erneut versuchen."
        )
    }

    static var typeToSearchHint: String {
        localized("type_to_search_hint", en: "Type at least 2 characters", de: "Mindestens 2 Zeichen eingeben")
    }

    static var done: String {
        localized("done", en: "Done", de: "Fertig")
    }

    static var expand: String {
        localized("expand", en: "Expand", de: "Erweitern")
    }

    static var collapse: String {
        localized("collapse", en: "Collapse", de: "Einklappen")
    }

    static var more: String {
        localized("more", en: "More", de: "Mehr")
    }

    static var addToFavorites: String {
        localized("add_to_favorites", en: "Add to favorites", de: "Zu Favoriten hinzufügen")
    }

    static var removeFromFavorites: String {
        localized("remove_from_favorites", en: "Remove from favorites", de: "Aus Favoriten entfernen")
    }

    static var today: String {
        localized("today", en: "Today", de: "Heute")
    }

    static var log: String {
        localized("log", en: "Log", de: "Eintragen")
    }

    static var error: String {
        localized("error", en: "Error", de: "Fehler")
    }

    static var ok: String {
        localized("ok", en: "OK", de: "OK")
    }

    // MARK: - Tabs

    static var home: String {
        localized("home", en: "Home", de: "Startseite")
    }

    static var foods: String {
        localized("foods", en: "Foods", de: "Lebensmittel")
    }

    static var favorites: String {
        localized("favorites", en: "Favorites", de: "Favoriten")
    }

    static var insights: String {
        localized("insights", en: "Insights", de: "Einblicke")
    }

    static var settings: String {
        localized("settings", en: "Settings", de: "Einstellungen")
    }

    // MARK: - Meals

    static var breakfast: String {
        localized("breakfast", en: "Breakfast", de: "Frühstück")
    }

    static var lunch: String {
        localized("lunch", en: "Lunch", de: "Mittagessen")
    }

    static var dinner: String {
        localized("dinner", en: "Dinner", de: "Abendessen")
    }

    static var snacks: String {
        localized("snacks", en: "Snacks", de: "Snacks")
    }

    static func mealName(_ key: String) -> String {
        switch key.lowercased() {
        case "breakfast": breakfast
        case "lunch": lunch
        case "dinner": dinner
        case "snacks", "snack": snacks
        default: key.capitalized
        }
    }

    // MARK: - Macros

    static var calories: String {
        localized("calories", en: "Calories", de: "Kalorien")
    }

    static var protein: String {
        localized("protein", en: "Protein", de: "Eiweiß")
    }

    static var carbs: String {
        localized("carbs", en: "Carbs", de: "Kohlenhydrate")
    }

    static var fat: String {
        localized("fat", en: "Fat", de: "Fett")
    }

    static var fiber: String {
        localized("fiber", en: "Fiber", de: "Ballaststoffe")
    }

    // MARK: - Dashboard

    static var noEntriesYet: String {
        localized(
            "no_entries_yet",
            en: "No entries yet today.",
            de: "Noch keine Einträge heute."
        )
    }

    static var tapToAdd: String {
        localized("tap_to_add", en: "Tap + to add food.", de: "Tippe + um Essen hinzuzufügen.")
    }

    static var goToToday: String {
        localized("go_to_today", en: "Go to Today", de: "Zu Heute")
    }

    static var copyYesterday: String {
        localized("copy_yesterday", en: "Copy Yesterday", de: "Gestern kopieren")
    }

    // MARK: - Foods

    static var searchFoods: String {
        localized("search_foods", en: "Search foods...", de: "Lebensmittel suchen...")
    }

    static var recent: String {
        localized("recent", en: "Recent", de: "Kürzlich")
    }

    static var noResults: String {
        localized("no_results", en: "No results", de: "Keine Ergebnisse")
    }

    static var noRecentFoods: String {
        localized(
            "no_recent_foods",
            en: "Foods you log will appear here",
            de: "Eingetragene Lebensmittel erscheinen hier"
        )
    }

    static var createFood: String {
        localized("create_food", en: "Create Food", de: "Lebensmittel erstellen")
    }

    static var editFood: String {
        localized("edit_food", en: "Edit Food", de: "Lebensmittel bearbeiten")
    }

    static var servingSize: String {
        localized("serving_size", en: "Serving Size", de: "Portionsgröße")
    }

    static var brand: String {
        localized("brand", en: "Brand", de: "Marke")
    }

    static var barcode: String {
        localized("barcode", en: "Barcode", de: "Barcode")
    }

    // MARK: - Nutrition

    static var mainMacros: String {
        localized("main_macros", en: "Main Macros", de: "Hauptnährstoffe")
    }

    static var fatBreakdown: String {
        localized("fat_breakdown", en: "Fat Breakdown", de: "Fettaufschlüsselung")
    }

    static var sugarsCarbs: String {
        localized("sugars_carbs", en: "Sugars & Carbs", de: "Zucker & Kohlenhydrate")
    }

    static var minerals: String {
        localized("minerals", en: "Minerals", de: "Mineralstoffe")
    }

    static var vitamins: String {
        localized("vitamins", en: "Vitamins", de: "Vitamine")
    }

    static var other: String {
        localized("other", en: "Other", de: "Sonstige")
    }

    static var nutrition: String {
        localized("nutrition", en: "Nutrition", de: "Nährwerte")
    }

    static var quality: String {
        localized("quality", en: "Quality", de: "Qualität")
    }

    static var ingredients: String {
        localized("ingredients", en: "Ingredients", de: "Zutaten")
    }

    static var nutriScore: String {
        localized("nutri_score", en: "Nutri-Score", de: "Nutri-Score")
    }

    static var novaGroup: String {
        localized("nova_group", en: "NOVA Group", de: "NOVA-Gruppe")
    }

    static var logged: String {
        localized("logged", en: "logged", de: "eingetragen")
    }

    static var failedToLog: String {
        localized("failed_to_log", en: "Failed to log", de: "Eintragung fehlgeschlagen")
    }

    /// Spoken/shown confirmation after a Siri / Shortcuts log.
    static func intentLoggedFood(_ name: String, meal: String, calories: Int) -> String {
        localized(
            "intent_logged_food",
            en: "Logged \(name) — \(mealName(meal)), \(calories) kcal",
            de: "\(name) eingetragen — \(mealName(meal)), \(calories) kcal"
        )
    }

    // MARK: - Entries

    static var logFood: String {
        localized("log_food", en: "Log Food", de: "Essen eintragen")
    }

    static var servings: String {
        localized("servings", en: "Servings", de: "Portionen")
    }

    static var meal: String {
        localized("meal", en: "Meal", de: "Mahlzeit")
    }

    static var time: String {
        localized("time", en: "Time", de: "Uhrzeit")
    }

    static var quickEntry: String {
        localized("quick_entry", en: "Quick Entry", de: "Schnelleintrag")
    }

    static var editEntry: String {
        localized("edit_entry", en: "Edit Entry", de: "Eintrag bearbeiten")
    }

    static var logRecipe: String {
        localized("log_recipe", en: "Log Recipe", de: "Rezept eintragen")
    }

    static var noEntries: String {
        localized("no_entries", en: "No entries", de: "Keine Einträge")
    }

    static var noFavorites: String {
        localized("no_favorites", en: "No favorites", de: "Keine Favoriten")
    }

    static var markFavoritesHint: String {
        localized(
            "mark_favorites_hint",
            en: "Mark foods as favorites to see them here",
            de: "Markiere Lebensmittel als Favoriten"
        )
    }

    static var markRecipeFavoritesHint: String {
        localized(
            "mark_recipe_favorites_hint",
            en: "Mark recipes as favorites to see them here",
            de: "Markiere Rezepte als Favoriten"
        )
    }

    static var addFood: String {
        localized("add_food", en: "Add Food", de: "Essen hinzufügen")
    }

    // MARK: - Recipes

    static var recipes: String {
        localized("recipes", en: "Recipes", de: "Rezepte")
    }

    static var createRecipe: String {
        localized("create_recipe", en: "Create Recipe", de: "Rezept erstellen")
    }

    static var editRecipe: String {
        localized("edit_recipe", en: "Edit Recipe", de: "Rezept bearbeiten")
    }

    static var totalServings: String {
        localized("total_servings", en: "Total Servings", de: "Gesamtportionen")
    }

    static var perServing: String {
        localized("per_serving", en: "Per Serving", de: "Pro Portion")
    }

    static var per100: String {
        localized("per_100", en: "Per 100 g", de: "Pro 100 g")
    }

    static var per100Ml: String {
        localized("per_100_ml", en: "Per 100 ml", de: "Pro 100 ml")
    }

    static var valuesPer: String {
        localized("values_per", en: "Values per", de: "Werte pro")
    }

    static var macroBasisFooter: String {
        localized(
            "macro_basis_footer",
            en: "Enter the macros per serving or per 100 g/ml — the values are converted for you.",
            de: "Makros pro Portion oder pro 100 g/ml eingeben — die Werte werden für dich umgerechnet."
        )
    }

    static var totals: String {
        localized("totals", en: "Totals", de: "Gesamt")
    }

    static var addIngredient: String {
        localized("add_ingredient", en: "Add Ingredient", de: "Zutat hinzufügen")
    }

    // MARK: - Goals

    static var goals: String {
        localized("goals", en: "Goals", de: "Ziele")
    }

    static var editGoals: String {
        localized("edit_goals", en: "Edit Goals", de: "Ziele bearbeiten")
    }

    static var dailyGoals: String {
        localized("daily_goals", en: "Daily Goals", de: "Tagesziele")
    }

    // MARK: - Weight

    static var weight: String {
        localized("weight", en: "Weight", de: "Gewicht")
    }

    static var logWeight: String {
        localized("log_weight", en: "Log Weight", de: "Gewicht eintragen")
    }

    static var current: String {
        localized("current", en: "Current", de: "Aktuell")
    }

    static var change: String {
        localized("change", en: "Change", de: "Änderung")
    }

    static var history: String {
        localized("history", en: "History", de: "Verlauf")
    }

    static var trend: String {
        localized("trend", en: "Trend", de: "Trend")
    }

    static var range: String {
        localized("range", en: "Range", de: "Zeitraum")
    }

    // MARK: - Supplements

    static var supplements: String {
        localized("supplements", en: "Supplements", de: "Nahrungsergänzung")
    }

    static var createSupplement: String {
        localized(
            "create_supplement",
            en: "Create Supplement",
            de: "Supplement erstellen"
        )
    }

    static var editSupplement: String {
        localized("edit_supplement", en: "Edit Supplement", de: "Supplement bearbeiten")
    }

    static var daily: String {
        localized("daily", en: "Daily", de: "Täglich")
    }

    static var everyOtherDay: String {
        localized("every_other_day", en: "Every other day", de: "Jeden zweiten Tag")
    }

    static var weekly: String {
        localized("weekly", en: "Weekly", de: "Wöchentlich")
    }

    static var custom: String {
        localized("custom", en: "Custom", de: "Benutzerdefiniert")
    }

    static var morning: String {
        localized("morning", en: "Morning", de: "Morgens")
    }

    static var noon: String {
        localized("noon", en: "Noon", de: "Mittags")
    }

    static var evening: String {
        localized("evening", en: "Evening", de: "Abends")
    }

    static var anytime: String {
        localized("anytime", en: "Anytime", de: "Jederzeit")
    }

    static var supplementHistory: String {
        localized(
            "supplement_history",
            en: "Supplement History",
            de: "Supplement-Verlauf"
        )
    }

    static var adherence: String {
        localized("adherence", en: "Adherence", de: "Einhaltung")
    }

    // MARK: - Insights

    static var streaks: String {
        localized("streaks", en: "Streaks", de: "Serien")
    }

    static var currentStreak: String {
        localized("current_streak", en: "Current", de: "Aktuell")
    }

    static var longestStreak: String {
        localized("longest_streak", en: "Longest", de: "Längste")
    }

    static var weeklyAvg: String {
        localized("weekly_avg", en: "Weekly Average", de: "Wochendurchschnitt")
    }

    static var monthlyAvg: String {
        localized("monthly_avg", en: "Monthly Average", de: "Monatsdurchschnitt")
    }

    static var monthly: String {
        localized("monthly", en: "Monthly", de: "Monatlich")
    }

    static var topFoods: String {
        localized("top_foods", en: "Top Foods", de: "Top-Lebensmittel")
    }

    static var mealBreakdown: String {
        localized("meal_breakdown", en: "Meal Breakdown", de: "Mahlzeitenverteilung")
    }

    static var caloriesTrend: String {
        localized("calories_trend", en: "Calorie Trend", de: "Kalorientrend")
    }

    static var macroTrends: String {
        localized("macro_trends", en: "Macro Trends", de: "Makro-Trends")
    }

    static var goalAchievement: String {
        localized("goal_achievement", en: "Goal Achievement", de: "Zielerreichung")
    }

    static var daysWithinGoal: String {
        localized(
            "days_within_goal",
            en: "Days within goal range",
            de: "Tage im Zielbereich"
        )
    }

    static var dayPeriod: String {
        localized("day_period", en: "day period", de: "Tage Zeitraum")
    }

    static var avgComparison: String {
        localized(
            "avg_comparison",
            en: "Average Comparison",
            de: "Durchschnittsvergleich"
        )
    }

    static var favoriteLogging: String {
        localized(
            "favorite_logging",
            en: "Favorite Logging",
            de: "Favoriten-Eintragung"
        )
    }

    static var autoAssignByTime: String {
        localized(
            "auto_assign_by_time",
            en: "Auto-assign by time",
            de: "Automatisch nach Uhrzeit"
        )
    }

    static var alwaysAsk: String {
        localized("always_ask", en: "Always ask", de: "Immer nachfragen")
    }

    static var quickLog: String {
        localized("quick_log", en: "Quick Log", de: "Schnelleintrag")
    }

    static var additives: String {
        localized("additives", en: "Additives", de: "Zusatzstoffe")
    }

    static var inactive: String {
        localized("inactive", en: "Inactive", de: "Inaktiv")
    }

    // MARK: - Calendar

    static var calendar: String {
        localized("calendar", en: "Calendar", de: "Kalender")
    }

    static var daysLogged: String {
        localized("days_logged", en: "Days Logged", de: "Tage eingetragen")
    }

    static var daysOnTarget: String {
        localized("days_on_target", en: "Days on Target", de: "Tage im Ziel")
    }

    // MARK: - Maintenance

    static var maintenance: String {
        localized("maintenance", en: "Maintenance", de: "Erhaltung")
    }

    static var maintenanceCalories: String {
        localized(
            "maintenance_calories",
            en: "Maintenance Calories",
            de: "Erhaltungskalorien"
        )
    }

    static var calculate: String {
        localized("calculate", en: "Calculate", de: "Berechnen")
    }

    static var period: String {
        localized("period", en: "Period", de: "Zeitraum")
    }

    static var weeks: String {
        localized("weeks", en: "weeks", de: "Wochen")
    }

    static var bodyComposition: String {
        localized(
            "body_composition",
            en: "Body Composition",
            de: "Körperzusammensetzung"
        )
    }

    static var dataCoverage: String {
        localized("data_coverage", en: "Data Coverage", de: "Datenabdeckung")
    }

    // MARK: - Settings

    static var signOut: String {
        localized("sign_out", en: "Sign Out", de: "Abmelden")
    }

    static var signOutConfirmation: String {
        localized(
            "sign_out_confirmation",
            en: "Data stored on this device will be removed, including changes that have not been synced yet. You will need to sign in again to use the app.",
            de: "Auf diesem Gerät gespeicherte Daten werden entfernt, einschliesslich noch nicht synchronisierter Änderungen. Du musst dich erneut anmelden, um die App zu nutzen."
        )
    }

    static func pendingSyncCount(_ count: Int) -> String {
        localized(
            "pending_sync_count",
            en: count == 1 ? "1 change waiting to sync" : "\(count) changes waiting to sync",
            de: count == 1 ? "1 Änderung wartet auf Synchronisierung" : "\(count) Änderungen warten auf Synchronisierung"
        )
    }

    // MARK: - Pending changes (sync queue) screen

    static var pendingChanges: String {
        localized("pending_changes", en: "Pending changes", de: "Ausstehende Änderungen")
    }

    static var pendingChangesEmpty: String {
        localized("pending_changes_empty", en: "Everything is synced", de: "Alles synchronisiert")
    }

    static var pendingChangesEmptyDetail: String {
        localized(
            "pending_changes_empty_detail",
            en: "Changes you make offline appear here until they sync.",
            de: "Offline vorgenommene Änderungen erscheinen hier, bis sie synchronisiert werden."
        )
    }

    static var retryNow: String {
        localized("retry_now", en: "Retry now", de: "Jetzt erneut versuchen")
    }

    static var syncWaiting: String {
        localized("sync_waiting", en: "Waiting", de: "Wartet")
    }

    static func syncRetryStatus(_ count: Int, _ max: Int) -> String {
        localized(
            "sync_retry_status",
            en: "Retry \(count)/\(max)",
            de: "Versuch \(count)/\(max)"
        )
    }

    /// Human-readable title for a queued sync operation, keyed by its stored
    /// `typeName` (see `SyncOperation.typeName`).
    static func pendingChangeTitle(forType type: String) -> String {
        switch type {
        case "create_food": localized("sync_create_food", en: "Added food", de: "Lebensmittel hinzugefügt")
        case "update_food": localized("sync_update_food", en: "Edited food", de: "Lebensmittel bearbeitet")
        case "delete_food": localized("sync_delete_food", en: "Deleted food", de: "Lebensmittel gelöscht")
        case "toggle_favorite": localized("sync_toggle_favorite", en: "Changed favorite", de: "Favorit geändert")
        case "create_entry": localized("sync_create_entry", en: "Logged food", de: "Mahlzeit protokolliert")
        case "update_entry": localized("sync_update_entry", en: "Edited log entry", de: "Eintrag bearbeitet")
        case "delete_entry": localized("sync_delete_entry", en: "Deleted log entry", de: "Eintrag gelöscht")
        case "create_recipe": localized("sync_create_recipe", en: "Added recipe", de: "Rezept hinzugefügt")
        case "update_recipe": localized("sync_update_recipe", en: "Edited recipe", de: "Rezept bearbeitet")
        case "delete_recipe": localized("sync_delete_recipe", en: "Deleted recipe", de: "Rezept gelöscht")
        case "set_goals": localized("sync_set_goals", en: "Updated goals", de: "Ziele aktualisiert")
        case "create_weight": localized(
                "sync_create_weight",
                en: "Added weight entry",
                de: "Gewichtseintrag hinzugefügt"
            )
        case "update_weight": localized(
                "sync_update_weight",
                en: "Edited weight entry",
                de: "Gewichtseintrag bearbeitet"
            )
        case "delete_weight": localized(
                "sync_delete_weight",
                en: "Deleted weight entry",
                de: "Gewichtseintrag gelöscht"
            )
        case "create_sleep": localized("sync_create_sleep", en: "Added sleep entry", de: "Schlafeintrag hinzugefügt")
        case "update_sleep": localized("sync_update_sleep", en: "Edited sleep entry", de: "Schlafeintrag bearbeitet")
        case "delete_sleep": localized("sync_delete_sleep", en: "Deleted sleep entry", de: "Schlafeintrag gelöscht")
        case "create_supplement": localized(
                "sync_create_supplement",
                en: "Added supplement",
                de: "Supplement hinzugefügt"
            )
        case "update_supplement": localized(
                "sync_update_supplement",
                en: "Edited supplement",
                de: "Supplement bearbeitet"
            )
        case "delete_supplement": localized(
                "sync_delete_supplement",
                en: "Deleted supplement",
                de: "Supplement gelöscht"
            )
        case "log_supplement": localized("sync_log_supplement", en: "Logged supplement", de: "Supplement protokolliert")
        case "unlog_supplement": localized(
                "sync_unlog_supplement",
                en: "Unlogged supplement",
                de: "Supplement-Protokoll entfernt"
            )
        case "set_day_properties": localized(
                "sync_set_day_properties",
                en: "Updated fasting day",
                de: "Fastentag aktualisiert"
            )
        case "delete_day_properties": localized(
                "sync_delete_day_properties",
                en: "Cleared fasting day",
                de: "Fastentag entfernt"
            )
        case "update_preferences": localized(
                "sync_update_preferences",
                en: "Updated settings",
                de: "Einstellungen aktualisiert"
            )
        default: localized("sync_generic_change", en: "Pending change", de: "Ausstehende Änderung")
        }
    }

    static var account: String {
        localized("account", en: "Account", de: "Konto")
    }

    static var about: String {
        localized("about", en: "About", de: "Über")
    }

    static var version: String {
        localized("version", en: "Version", de: "Version")
    }

    static var language: String {
        localized("language", en: "Language", de: "Sprache")
    }

    static var customMealTypes: String {
        localized(
            "custom_meal_types",
            en: "Custom Meal Types",
            de: "Eigene Mahlzeittypen"
        )
    }

    static var visibleNutrients: String {
        localized(
            "visible_nutrients",
            en: "Visible Nutrients",
            de: "Sichtbare Nährstoffe"
        )
    }

    static var dashboardWidgets: String {
        localized(
            "dashboard_widgets",
            en: "Dashboard Widgets",
            de: "Dashboard-Widgets"
        )
    }

    static var favoriteBehavior: String {
        localized(
            "favorite_behavior",
            en: "Favorite Behavior",
            de: "Favoriten-Verhalten"
        )
    }

    static var appleHealth: String {
        localized("apple_health", en: "Apple Health", de: "Apple Health")
    }

    static var healthConnected: String {
        localized("health_connected", en: "Connected", de: "Verbunden")
    }

    static var healthNotConnected: String {
        localized("health_not_connected", en: "Not connected", de: "Nicht verbunden")
    }

    static var healthConnect: String {
        localized("health_connect", en: "Connect", de: "Verbinden")
    }

    static var healthDisconnect: String {
        localized("health_disconnect", en: "Disconnect", de: "Trennen")
    }

    static var healthReadingSection: String {
        localized("health_reading_section", en: "Reading from Health", de: "Aus Health lesen")
    }

    static var healthWritingSection: String {
        localized("health_writing_section", en: "Writing to Health", de: "In Health schreiben")
    }

    static var healthNutrientsSection: String {
        localized(
            "health_nutrients_section",
            en: "Nutrients (Writing to Health)",
            de: "Nährstoffe (in Health schreiben)"
        )
    }

    static func healthLastSynced(_ when: String) -> String {
        localized(
            "health_last_synced",
            en: "Last synced \(when)",
            de: "Zuletzt synchronisiert \(when)"
        )
    }

    static var healthConnectFooter: String {
        localized(
            "health_connect_footer",
            en: "Connecting enables the weight import from Apple Health. Each data type below can be enabled individually — its permission is requested when you turn it on.",
            de: "Beim Verbinden wird der Gewichtsimport aus Apple Health aktiviert. Jeder Datentyp unten lässt sich einzeln aktivieren — die Berechtigung wird erst beim Einschalten angefragt."
        )
    }

    static var healthDisconnectFooter: String {
        localized(
            "health_disconnect_footer",
            en: "Disconnecting turns off all syncing with Apple Health. To revoke granted permissions, use the Health app.",
            de: "Beim Trennen wird die gesamte Synchronisierung mit Apple Health deaktiviert. Um erteilte Berechtigungen zu widerrufen, verwende die Health-App."
        )
    }

    static var healthReadingFooter: String {
        localized(
            "health_reading_footer",
            en: "Data recorded in Apple Health (e.g. by a smart scale or Apple Watch) is imported automatically. Apple doesn't share its own Sleep Score with other apps, so nights arrive with an estimate based on their duration, your usual bedtime and how often you woke — close to Apple's number, but not identical. You can edit it.",
            de: "In Apple Health aufgezeichnete Daten (z. B. von einer smarten Waage oder der Apple Watch) werden automatisch importiert. Apple gibt den eigenen Schlafscore nicht an andere Apps weiter — Nächte erhalten deshalb einen Schätzwert aus Dauer, üblicher Schlafenszeit und Aufwachvorgängen. Er liegt nahe an Apples Wert, ist aber nicht identisch, und lässt sich bearbeiten."
        )
    }

    static var healthReimportSleep: String {
        localized(
            "health_reimport_sleep",
            en: "Re-import Nights from Health",
            de: "Nächte aus Health neu importieren"
        )
    }

    static var healthReimportSleepConfirm: String {
        localized(
            "health_reimport_sleep_confirm",
            en: "Replace the last 90 days of sleep entries with what Apple Health has recorded. Nights you edited by hand and nights Health has no record of will be overwritten or left behind.",
            de: "Ersetzt die Schlafeinträge der letzten 90 Tage durch die Aufzeichnungen aus Apple Health. Von Hand bearbeitete Nächte und Nächte ohne Health-Aufzeichnung werden überschrieben bzw. bleiben unverändert."
        )
    }

    static func healthReimportSleepResult(_ count: Int) -> String {
        localized(
            "health_reimport_sleep_result",
            en: count == 1 ? "1 night updated" : "\(count) nights updated",
            de: count == 1 ? "1 Nacht aktualisiert" : "\(count) Nächte aktualisiert"
        )
    }

    static var healthWritingFooter: String {
        localized(
            "health_writing_footer",
            en: "Weight and sleep logged in the app are saved to Apple Health. Leave these off if another device already records them — you would get duplicates.",
            de: "In der App erfasstes Gewicht und erfasster Schlaf werden in Apple Health gespeichert. Lass dies aus, wenn ein anderes Gerät sie bereits aufzeichnet — sonst entstehen Duplikate."
        )
    }

    static var healthNutrientsFooter: String {
        localized(
            "health_nutrients_footer",
            en: "Daily totals for enabled nutrients are written to Apple Health whenever you log, edit or delete food entries.",
            de: "Tagessummen aktivierter Nährstoffe werden in Apple Health geschrieben, sobald du Einträge erfasst, bearbeitest oder löschst."
        )
    }

    // MARK: - Scanner

    static var scanBarcode: String {
        localized("scan_barcode", en: "Scan Barcode", de: "Barcode scannen")
    }

    static var lookingUp: String {
        localized("looking_up", en: "Looking up barcode...", de: "Barcode wird gesucht...")
    }

    static var notFound: String {
        localized(
            "not_found",
            en: "No food found for this barcode",
            de: "Kein Lebensmittel für diesen Barcode gefunden"
        )
    }

    static var cameraRequired: String {
        localized(
            "camera_required",
            en: "Camera access required",
            de: "Kamerazugriff erforderlich"
        )
    }

    static var openSettings: String {
        localized("open_settings", en: "Open Settings", de: "Einstellungen öffnen")
    }

    static var enableCameraHint: String {
        localized(
            "enable_camera_hint",
            en: "Enable camera access in Settings to scan barcodes.",
            de: "Aktiviere den Kamerazugriff in den Einstellungen, um Barcodes zu scannen."
        )
    }

    static var createFoodForBarcode: String {
        localized(
            "create_food_for_barcode",
            en: "Create food for this barcode",
            de: "Lebensmittel für diesen Barcode erstellen"
        )
    }

    static var torch: String {
        localized("torch", en: "Torch", de: "Taschenlampe")
    }

    // MARK: - Nutrition label scanner

    static var scanLabel: String {
        localized("scan_label", en: "Scan nutrition label", de: "Nährwerte scannen")
    }

    static var scanLabelFooter: String {
        localized(
            "scan_label_footer",
            en: "Photograph a nutrition facts panel to prefill the values below.",
            de: "Fotografiere eine Nährwerttabelle, um die Werte unten zu übernehmen."
        )
    }

    static var scanLabelHint: String {
        localized(
            "scan_label_hint",
            en: "Capture or choose a clear, straight-on photo of the nutrition facts panel.",
            de: "Nimm ein klares, gerades Foto der Nährwerttabelle auf oder wähle eines aus."
        )
    }

    static var scanningLabel: String {
        localized("scanning_label", en: "Reading nutrition facts...", de: "Nährwerte werden gelesen...")
    }

    static var takePhoto: String {
        localized("take_photo", en: "Take Photo", de: "Foto aufnehmen")
    }

    static var choosePhoto: String {
        localized("choose_photo", en: "Choose Photo", de: "Foto auswählen")
    }

    static var scanLabelNoData: String {
        localized(
            "scan_label_no_data",
            en: "Couldn't read the nutrition values. Try a clearer, straight-on photo.",
            de: "Die Nährwerte konnten nicht gelesen werden. Versuche ein klareres, gerades Foto."
        )
    }

    static var scanLabelFailed: String {
        localized(
            "scan_label_failed",
            en: "Couldn't process the image.",
            de: "Das Bild konnte nicht verarbeitet werden."
        )
    }

    static var additionalNutrients: String {
        localized("additional_nutrients", en: "Additional Nutrients", de: "Weitere Nährstoffe")
    }

    static var addNutrient: String {
        localized("add_nutrient", en: "Add Nutrient", de: "Nährstoff hinzufügen")
    }

    static var sugar: String {
        localized("sugar", en: "Sugar", de: "Zucker")
    }

    static var saturatedFat: String {
        localized("saturated_fat", en: "Saturated Fat", de: "Gesättigte Fettsäuren")
    }

    static var salt: String {
        localized("salt", en: "Salt", de: "Salz")
    }

    static var sodium: String {
        localized("sodium", en: "Sodium", de: "Natrium")
    }

    // MARK: - Login

    static var trackNutrition: String {
        localized(
            "track_nutrition",
            en: "Track your nutrition",
            de: "Verfolge deine Ernährung"
        )
    }

    static var signIn: String {
        localized("sign_in", en: "Sign in", de: "Anmelden")
    }

    static var continueWithoutAccount: String {
        localized(
            "continue_without_account",
            en: "Continue without account",
            de: "Ohne Konto fortfahren"
        )
    }

    static var localModeExplainer: String {
        localized(
            "local_mode_explainer",
            en: "Your data stays on this device. Sign in later anytime to sync.",
            de: "Deine Daten bleiben auf diesem Gerät. Du kannst dich jederzeit später anmelden, um zu synchronisieren."
        )
    }

    static var sessionExpiredTitle: String {
        localized("session_expired_title", en: "Session expired", de: "Sitzung abgelaufen")
    }

    static var sessionExpiredMessage: String {
        localized(
            "session_expired_message",
            en: "Your data is safe on this device. Sign in again to keep syncing.",
            de: "Deine Daten sind auf diesem Gerät gespeichert. Melde dich erneut an, um weiter zu synchronisieren."
        )
    }

    static var notNow: String {
        localized("not_now", en: "Not now", de: "Nicht jetzt")
    }

    // MARK: - Local mode / Account

    static var localModeStatus: String {
        localized(
            "local_mode_status",
            en: "Local mode — data only on this device",
            de: "Lokaler Modus — Daten nur auf diesem Gerät"
        )
    }

    static var signInToSync: String {
        localized("sign_in_to_sync", en: "Sign in to sync", de: "Anmelden zum Synchronisieren")
    }

    // MARK: - Migration

    static var migrationAccountHasData: String {
        localized(
            "migration_account_has_data",
            en: "Your account already has data",
            de: "Dein Konto enthält bereits Daten"
        )
    }

    static var migrationChoiceDescription: String {
        localized(
            "migration_choice_description",
            en: "You can upload the data stored on this device to your account, "
                + "or discard it and continue with your account data only.",
            de: "Du kannst die auf diesem Gerät gespeicherten Daten in dein Konto hochladen "
                + "oder sie verwerfen und nur mit deinen Kontodaten fortfahren."
        )
    }

    static func migrationUploadItems(_ count: Int) -> String {
        localized(
            "migration_upload_items",
            en: "Upload local data (\(count) items)",
            de: "Lokale Daten hochladen (\(count) Einträge)"
        )
    }

    static var migrationStartFresh: String {
        localized(
            "migration_start_fresh",
            en: "Start fresh (discard local data)",
            de: "Neu beginnen (lokale Daten verwerfen)"
        )
    }

    static var migrationDiscardTitle: String {
        localized(
            "migration_discard_title",
            en: "Discard local data?",
            de: "Lokale Daten verwerfen?"
        )
    }

    static var migrationDiscardMessage: String {
        localized(
            "migration_discard_message",
            en: "All foods, recipes, log entries and other data stored on this device "
                + "will be permanently deleted. The data in your account is kept.",
            de: "Alle Lebensmittel, Rezepte, Einträge und sonstigen Daten auf diesem Gerät "
                + "werden dauerhaft gelöscht. Die Daten in deinem Konto bleiben erhalten."
        )
    }

    static var discard: String {
        localized("discard", en: "Discard", de: "Verwerfen")
    }

    static var migrationUploading: String {
        localized("migration_uploading", en: "Uploading your data", de: "Deine Daten werden hochgeladen")
    }

    static var migrationFailedTitle: String {
        localized("migration_failed_title", en: "Upload failed", de: "Hochladen fehlgeschlagen")
    }

    static var migrationFailureSafe: String {
        localized(
            "migration_failure_safe",
            en: "Your local data is safe — already uploaded items are not lost and the "
                + "upload continues where it stopped.",
            de: "Deine lokalen Daten sind sicher — bereits hochgeladene Einträge gehen nicht "
                + "verloren und das Hochladen wird dort fortgesetzt, wo es aufgehört hat."
        )
    }

    static func migrationStepLabel(_ step: MigrationStep) -> String {
        switch step {
        case .prepare:
            localized("migration_step_prepare", en: "Preparing", de: "Vorbereiten")
        case .foods:
            localized("migration_step_foods", en: "Uploading foods", de: "Lebensmittel hochladen")
        case .recipes:
            localized("migration_step_recipes", en: "Uploading recipes", de: "Rezepte hochladen")
        case .entries:
            localized("migration_step_entries", en: "Uploading entries", de: "Einträge hochladen")
        case .weights:
            localized("migration_step_weights", en: "Uploading weight entries", de: "Gewichtseinträge hochladen")
        case .sleep:
            localized("migration_step_sleep", en: "Uploading sleep entries", de: "Schlafeinträge hochladen")
        case .supplements:
            localized("migration_step_supplements", en: "Uploading supplements", de: "Supplements hochladen")
        case .supplementLogs:
            localized(
                "migration_step_supplement_logs",
                en: "Uploading supplement logs",
                de: "Supplement-Einnahmen hochladen"
            )
        case .goals:
            localized("migration_step_goals", en: "Uploading goals", de: "Ziele hochladen")
        case .preferences:
            localized("migration_step_preferences", en: "Uploading preferences", de: "Einstellungen hochladen")
        case .dayProperties:
            localized(
                "migration_step_day_properties",
                en: "Uploading day properties",
                de: "Tageseigenschaften hochladen"
            )
        }
    }

    // MARK: - Day Properties

    static var fastingDay: String {
        localized("fasting_day", en: "Fasting Day", de: "Fastentag")
    }

    static var fastingDayToggle: String {
        localized(
            "fasting_day_toggle",
            en: "Mark as fasting day",
            de: "Als Fastentag markieren"
        )
    }

    static var fastingDayDescription: String {
        localized(
            "fasting_day_description",
            en: "Include this 0-calorie day in statistics and predictions",
            de: "Diesen 0-Kalorien-Tag in Statistiken und Prognosen einbeziehen"
        )
    }

    // MARK: - Fasting Tracker

    static var fasting: String {
        localized("fasting", en: "Fasting", de: "Fasten")
    }

    static var startFast: String {
        localized("start_fast", en: "Start Fast", de: "Fasten starten")
    }

    static var endFast: String {
        localized("end_fast", en: "End Fast", de: "Fasten beenden")
    }

    static var fastingProtocol: String {
        localized("fasting_protocol", en: "Protocol", de: "Protokoll")
    }

    static var fastingStarted: String {
        localized("fasting_started", en: "Started", de: "Gestartet")
    }

    static var fastingEnds: String {
        localized("fasting_ends", en: "Ends", de: "Endet")
    }

    static var fastingChangeTarget: String {
        localized("fasting_change_target", en: "Change Target", de: "Ziel ändern")
    }

    static var fastingTargetReached: String {
        localized("fasting_target_reached", en: "Target reached", de: "Ziel erreicht")
    }

    static var fastingNoHistory: String {
        localized("fasting_no_history", en: "No fasts yet", de: "Noch kein Fasten")
    }

    static var fastingNotRunning: String {
        localized(
            "fasting_not_running",
            en: "Pick a protocol and start your fast",
            de: "Wähle ein Protokoll und starte dein Fasten"
        )
    }

    static var fastingLiveActivityHint: String {
        localized(
            "fasting_live_activity_hint",
            en: "Enable Live Activities in Settings to see the timer on your Lock Screen",
            de: "Aktiviere Live-Aktivitäten in den Einstellungen, um den Timer auf dem Sperrbildschirm zu sehen"
        )
    }

    static var fastingEndConfirmation: String {
        localized(
            "fasting_end_confirmation",
            en: "End your fast? Today will be marked as a fasting day.",
            de: "Fasten beenden? Heute wird als Fastentag markiert."
        )
    }

    static func fastingTargetHours(_ hours: Int) -> String {
        localized("fasting_target_hours", en: "\(hours) h target", de: "\(hours) h Ziel")
    }

    static func fastingOfTargetHours(_ hours: Int) -> String {
        localized("fasting_of_target_hours", en: "of \(hours) h", de: "von \(hours) h")
    }

    static func fastingProtocolDescription(fasting: Int, eating: Int) -> String {
        localized(
            "fasting_protocol_description",
            en: "Fast for \(fasting) h, eat within \(eating) h",
            de: "\(fasting) h fasten, innerhalb von \(eating) h essen"
        )
    }

    static func fastingCustomDescription(_ hours: Int) -> String {
        localized(
            "fasting_custom_description",
            en: "Fast for \(hours) h",
            de: "\(hours) h fasten"
        )
    }

    // MARK: - Weight (additional)

    static var latestWeight: String {
        localized("latest_weight", en: "Latest", de: "Aktuell")
    }

    static var trendWeight: String {
        localized("trend_weight", en: "Trend", de: "Trend")
    }

    static var delta7d: String {
        localized("delta_7d", en: "7d Change", de: "7-Tage-Änderung")
    }

    static var showAll: String {
        localized("show_all", en: "Show all", de: "Alle anzeigen")
    }

    static var trendRising: String {
        localized("trend_rising", en: "Rising", de: "Steigend")
    }

    static var trendFalling: String {
        localized("trend_falling", en: "Falling", de: "Fallend")
    }

    static var trendSteady: String {
        localized("trend_steady", en: "Steady", de: "Stabil")
    }

    static func deltaPerWeek(_ formatted: String) -> String {
        localized("delta_per_week", en: "\(formatted) / 7d", de: "\(formatted) / 7T")
    }

    static var projected: String {
        localized("projected", en: "Projected", de: "Prognose")
    }

    static var projection14d: String {
        localized("projection_14d", en: "14d", de: "14T")
    }

    static var projection30d: String {
        localized("projection_30d", en: "30d", de: "30T")
    }

    static var projection60d: String {
        localized("projection_60d", en: "60d", de: "60T")
    }

    static var movingAverage7d: String {
        localized("moving_average_7d", en: "7d avg", de: "7T Ø")
    }

    static var notes: String {
        localized("notes", en: "Notes", de: "Notizen")
    }

    // MARK: - Sleep

    static var sleep: String {
        localized("sleep", en: "Sleep", de: "Schlaf")
    }

    static var logSleep: String {
        localized("log_sleep", en: "Log Sleep", de: "Schlaf erfassen")
    }

    static var sleepDuration: String {
        localized("sleep_duration", en: "Duration", de: "Dauer")
    }

    static var sleepQuality: String {
        localized("sleep_quality", en: "Quality", de: "Qualität")
    }

    static var sleepQualityPoor: String {
        localized("sleep_quality_poor", en: "Poor", de: "Schlecht")
    }

    static var sleepQualityGreat: String {
        localized("sleep_quality_great", en: "Great", de: "Gut")
    }

    static var bedtime: String {
        localized("sleep_bedtime", en: "Bedtime", de: "Schlafenszeit")
    }

    static var wakeTime: String {
        localized("sleep_wake_time", en: "Wake time", de: "Aufwachzeit")
    }

    static var wakeUps: String {
        localized("sleep_wake_ups", en: "Wake-ups", de: "Aufwachphasen")
    }

    static var bedAndWakeTimes: String {
        localized("bed_and_wake_times", en: "Bed & wake times", de: "Schlafens- & Aufwachzeit")
    }

    static var lastNight: String {
        localized("last_night", en: "Last night", de: "Letzte Nacht")
    }

    static var sevenDayAverage: String {
        localized("seven_day_average", en: "7d average", de: "7T-Schnitt")
    }

    static var hours: String {
        localized("hours", en: "Hours", de: "Stunden")
    }

    static var minutes: String {
        localized("minutes", en: "Minutes", de: "Minuten")
    }

    static var hoursShort: String {
        localized("hours_short", en: "hr", de: "Std")
    }

    static var minutesShort: String {
        localized("minutes_short", en: "min", de: "Min")
    }

    // MARK: - Insights (additional)

    static var calendarHeatmap: String {
        localized("calendar_heatmap", en: "Calendar", de: "Kalender")
    }

    static var macroBalance: String {
        localized("macro_balance", en: "Macro Balance", de: "Makro-Balance")
    }

    static var onTarget: String {
        localized("on_target", en: "On Target", de: "Im Ziel")
    }

    static var hasEntries: String {
        localized("has_entries", en: "Has Entries", de: "Einträge vorhanden")
    }

    static var noData: String {
        localized("no_data", en: "No data", de: "Keine Daten")
    }

    static var average: String {
        localized("average", en: "Avg", de: "Ø")
    }

    static var avgCalories: String {
        localized("avg_calories", en: "Avg Calories", de: "Ø Kalorien")
    }

    // MARK: - Visible Nutrients (additional)

    static var selectAll: String {
        localized("select_all", en: "Select All", de: "Alle auswählen")
    }

    static var deselectAll: String {
        localized("deselect_all", en: "Deselect All", de: "Alle abwählen")
    }

    static var fatBreakdownCategory: String {
        localized(
            "fat_breakdown_category",
            en: "Fat Breakdown",
            de: "Fettaufschlüsselung"
        )
    }

    static var sugarsAndCarbs: String {
        localized("sugars_and_carbs", en: "Sugars & Carbs", de: "Zucker & Kohlenhydrate")
    }

    // MARK: - Maintenance (additional)

    static var avgDailyIntake: String {
        localized("avg_daily_intake", en: "Avg Daily Intake", de: "Ø Tagesaufnahme")
    }

    static var dailyDeficitSurplus: String {
        localized(
            "daily_deficit_surplus",
            en: "Daily Surplus/Deficit",
            de: "Täglicher Überschuss/Defizit"
        )
    }

    static var weightChange: String {
        localized("weight_change", en: "Weight Change", de: "Gewichtsänderung")
    }

    static var fatChange: String {
        localized("fat_change", en: "Fat Change", de: "Fettänderung")
    }

    static var muscleChange: String {
        localized("muscle_change", en: "Muscle Change", de: "Muskeländerung")
    }

    static var totalDays: String {
        localized("total_days", en: "Total Days", de: "Gesamttage")
    }

    static var weightEntries: String {
        localized("weight_entries", en: "Weight Entries", de: "Gewichtseinträge")
    }

    static var foodEntryDays: String {
        localized("food_entry_days", en: "Food Entry Days", de: "Tage mit Einträgen")
    }

    static var coverage: String {
        localized("coverage", en: "Coverage", de: "Abdeckung")
    }

    static var startWeight: String {
        localized("start_weight", en: "Start Weight", de: "Startgewicht")
    }

    static var endWeight: String {
        localized("end_weight", en: "End Weight", de: "Endgewicht")
    }

    static var lowCoverageWarning: String {
        localized(
            "low_coverage_warning",
            en: "Low data coverage may affect accuracy",
            de: "Geringe Datenabdeckung kann die Genauigkeit beeinflussen"
        )
    }

    static var maintenanceInsufficientData: String {
        localized(
            "maintenance_insufficient_data",
            en: "Not enough data. Log at least two weights and some food in this range.",
            de: "Nicht genug Daten. Erfasse mindestens zwei Gewichte und einige Mahlzeiten in diesem Zeitraum."
        )
    }

    static var kcalPerDay: String {
        localized("kcal_per_day", en: "kcal/day", de: "kcal/Tag")
    }

    static var fatLabel: String {
        localized("fat_label", en: "Fat", de: "Fett")
    }

    static var muscleLabel: String {
        localized("muscle_label", en: "Muscle", de: "Muskel")
    }

    // MARK: - Supplement History (additional)

    static var taken: String {
        localized("taken", en: "Taken", de: "Eingenommen")
    }

    static var noHistoryForPeriod: String {
        localized(
            "no_history_for_period",
            en: "No history for this period",
            de: "Kein Verlauf für diesen Zeitraum"
        )
    }

    static var from: String {
        localized("from", en: "From", de: "Von")
    }

    static var to: String {
        localized("to", en: "To", de: "Bis")
    }

    static var dateRange: String {
        localized("date_range", en: "Date Range", de: "Zeitraum")
    }

    // MARK: - Navigation Tabs

    static var navigationTabs: String {
        localized("navigation_tabs", en: "Navigation Tabs", de: "Navigationsleiste")
    }

    static var selectTabs: String {
        localized("select_tabs", en: "Select up to 3 tabs", de: "Wähle bis zu 3 Tabs")
    }

    // MARK: - Entries (additional)

    static func entriesCopied(_ count: Int) -> String {
        localized("entries_copied", en: "\(count) entries copied", de: "\(count) Einträge kopiert")
    }

    static var failedToCopy: String {
        localized(
            "failed_to_copy",
            en: "Failed to copy entries",
            de: "Einträge konnten nicht kopiert werden"
        )
    }

    static func copyConfirmation(to date: String) -> String {
        localized(
            "copy_confirmation",
            en: "Copy all entries from yesterday to \(date)?",
            de: "Alle Einträge von gestern nach \(date) kopieren?"
        )
    }

    // MARK: - NOVA Groups

    static var novaUnprocessed: String {
        localized("nova_unprocessed", en: "Unprocessed", de: "Unverarbeitet")
    }

    static var novaProcessedIngredients: String {
        localized(
            "nova_processed_ingredients",
            en: "Processed ingredients",
            de: "Verarbeitete Zutaten"
        )
    }

    static var novaProcessed: String {
        localized("nova_processed", en: "Processed", de: "Verarbeitet")
    }

    static var novaUltraProcessed: String {
        localized(
            "nova_ultra_processed",
            en: "Ultra-processed",
            de: "Hochverarbeitet"
        )
    }

    static func novaGroupDescription(_ group: Int) -> String {
        switch group {
        case 1: novaUnprocessed
        case 2: novaProcessedIngredients
        case 3: novaProcessed
        case 4: novaUltraProcessed
        default: localized("nova_unknown", en: "Unknown", de: "Unbekannt")
        }
    }

    // MARK: - AI Meal Estimation

    static var date: String {
        localized("date", en: "Date", de: "Datum")
    }

    static var aiMealEstimate: String {
        localized("ai_meal_estimate", en: "AI Meal Estimate", de: "KI-Mahlzeitenschätzung")
    }

    static var aiMealWhatDidYouEat: String {
        localized("ai_meal_what_did_you_eat", en: "What did you eat?", de: "Was hast du gegessen?")
    }

    static var aiMealDescriptionPlaceholder: String {
        localized(
            "ai_meal_description_placeholder",
            en: "Describe your meal, e.g. \"2 eggs and a slice of toast\"",
            de: "Beschreibe deine Mahlzeit, z. B. \"2 Eier und eine Scheibe Toast\""
        )
    }

    static var aiMealEstimateButton: String {
        localized("ai_meal_estimate_button", en: "Estimate", de: "Schätzen")
    }

    static var aiMealEstimating: String {
        localized("ai_meal_estimating", en: "Estimating...", de: "Wird geschätzt...")
    }

    static var aiMealDeviceNotEligible: String {
        localized(
            "ai_meal_device_not_eligible",
            en: "This device doesn't support Apple Intelligence.",
            de: "Dieses Gerät unterstützt Apple Intelligence nicht."
        )
    }

    static var aiMealAppleIntelligenceDisabled: String {
        localized(
            "ai_meal_apple_intelligence_disabled",
            en: "Enable Apple Intelligence in Settings to use this feature.",
            de: "Aktiviere Apple Intelligence in den Einstellungen, um diese Funktion zu nutzen."
        )
    }

    static var aiMealModelNotReady: String {
        localized(
            "ai_meal_model_not_ready",
            en: "The on-device model is still downloading. Try again soon.",
            de: "Das Modell auf dem Gerät wird noch heruntergeladen. Versuche es bald erneut."
        )
    }

    static var aiMealOsUnsupported: String {
        localized(
            "ai_meal_os_unsupported",
            en: "This feature requires iOS 26 or later.",
            de: "Diese Funktion benötigt iOS 26 oder neuer."
        )
    }

    static var aiMealGuardrailError: String {
        localized(
            "ai_meal_guardrail_error",
            en: "Couldn't process that description. Try rephrasing it.",
            de: "Diese Beschreibung konnte nicht verarbeitet werden. Formuliere sie anders."
        )
    }

    static var aiMealContextWindowError: String {
        localized(
            "ai_meal_context_window_error",
            en: "That description is too long. Try a shorter one.",
            de: "Diese Beschreibung ist zu lang. Versuche eine kürzere."
        )
    }

    static var aiMealUnsupportedLanguageError: String {
        localized(
            "ai_meal_unsupported_language_error",
            en: "Try describing your meal in English or German.",
            de: "Beschreibe deine Mahlzeit auf Englisch oder Deutsch."
        )
    }

    static var aiMealGenerationError: String {
        localized(
            "ai_meal_generation_error",
            en: "Couldn't estimate this meal. Try again.",
            de: "Diese Mahlzeit konnte nicht geschätzt werden. Versuche es erneut."
        )
    }

    static var aiMealReviewTitle: String {
        localized("ai_meal_review_title", en: "Review Estimate", de: "Schätzung überprüfen")
    }

    static var aiMealDisclaimer: String {
        localized(
            "ai_meal_disclaimer",
            en: "AI estimate — verify before logging.",
            de: "KI-Schätzung — vor dem Eintragen überprüfen."
        )
    }

    static func aiMealMatched(_ foodName: String) -> String {
        localized("ai_meal_matched", en: "Matched: \(foodName)", de: "Zugeordnet: \(foodName)")
    }

    static var aiMealLowConfidence: String {
        localized("ai_meal_low_confidence", en: "Low confidence", de: "Geringe Sicherheit")
    }

    static var aiMealNoItemsFound: String {
        localized(
            "ai_meal_no_items_found",
            en: "No items were found in that description",
            de: "In dieser Beschreibung wurden keine Einträge gefunden"
        )
    }

    static func aiMealLogItems(_ count: Int) -> String {
        localized(
            "ai_meal_log_items",
            en: count == 1 ? "Log 1 Item" : "Log \(count) Items",
            de: count == 1 ? "1 Eintrag protokollieren" : "\(count) Einträge protokollieren"
        )
    }

    static func aiMealItemsLogged(_ count: Int) -> String {
        localized(
            "ai_meal_items_logged",
            en: count == 1 ? "1 item logged" : "\(count) items logged",
            de: count == 1 ? "1 Eintrag protokolliert" : "\(count) Einträge protokolliert"
        )
    }

    // MARK: - AI Task Queue

    static var aiTaskPhotoSectionTitle: String {
        localized("ai_task_photo_section_title", en: "Attach a Photo", de: "Foto anhängen")
    }

    static var aiTaskSendButton: String {
        localized("ai_task_send_button", en: "Send to My Assistant", de: "An meinen Assistenten senden")
    }

    static var aiTaskSending: String {
        localized("ai_task_sending", en: "Sending...", de: "Wird gesendet...")
    }

    static var aiTaskQueued: String {
        localized(
            "ai_task_queued",
            en: "Queued — your assistant will log it later",
            de: "In Warteschlange — dein Assistent trägt es später ein"
        )
    }

    static func aiTaskPendingCount(_ count: Int) -> String {
        localized(
            "ai_task_pending_count",
            en: count == 1 ? "1 task waiting" : "\(count) tasks waiting",
            de: count == 1 ? "1 Aufgabe wartet" : "\(count) Aufgaben warten"
        )
    }

    // MARK: - Weekday Abbreviations

    static var weekdayHeaders: [String] {
        switch currentLocale {
        case .en: ["M", "T", "W", "T", "F", "S", "S"]
        case .de: ["M", "D", "M", "D", "F", "S", "S"]
        }
    }

    // MARK: - Private

    private nonisolated(unsafe) static var _storedLocale: String?

    private static var storedLocale: String {
        get {
            _storedLocale ?? UserDefaults.standard.string(forKey: "app_locale") ?? ""
        }
        set {
            _storedLocale = newValue
            UserDefaults.standard.set(newValue, forKey: "app_locale")
        }
    }

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
        case .en: en
        case .de: de
        }
    }
}

// swiftlint:enable type_body_length
