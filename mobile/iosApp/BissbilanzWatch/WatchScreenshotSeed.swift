import Foundation

#if DEBUG

/// Invented demo data for the watch store screenshots. The screenshot workflow
/// (`.github/workflows/store-screenshots-ios.yml`) launches a Debug watch
/// simulator build with `-store_screenshots YES`. A lone watch simulator has no
/// phone to sync from, so `WatchConnectivityManager` takes this state instead
/// of the stored one and never activates its session. The foods and numbers
/// match the phone's `StoreScreenshotSeed`; no real diary ever reaches a
/// screenshot.
enum WatchScreenshotSeed {
    enum Screen: String {
        case insights
        case meals
        case log
        case weight
        case sleep
    }

    /// `UserDefaults` key, set from the launch arguments.
    static let launchKey = "store_screenshots"
    /// `UserDefaults` key for the screen to open on.
    static let screenKey = "store_screenshot_screen"
    /// `UserDefaults` key for the in-app language, `en` or `de`.
    static let localeKey = "app_locale"

    static var isRequested: Bool {
        UserDefaults.standard.bool(forKey: launchKey)
    }

    static var screen: Screen {
        UserDefaults.standard.string(forKey: screenKey).flatMap(Screen.init(rawValue:)) ?? .insights
    }

    static var state: WatchState {
        let today = WidgetSnapshotStore.isoDateString(from: Date())
        let german = UserDefaults.standard.string(forKey: localeKey) == "de"
        let snapshot = WidgetSnapshot(
            date: today,
            localeCode: german ? "de" : "en",
            calories: 1640,
            protein: 118,
            carbs: 168,
            fat: 54,
            fiber: 24,
            calorieGoal: 2200,
            proteinGoal: 150,
            carbGoal: 240,
            fatGoal: 70,
            fiberGoal: 30,
            meals: [
                WidgetSnapshot.Meal(mealType: "breakfast", calories: 480),
                WidgetSnapshot.Meal(mealType: "lunch", calories: 620),
                WidgetSnapshot.Meal(mealType: "snacks", calories: 260),
                WidgetSnapshot.Meal(mealType: "dinner", calories: 280),
            ],
            latestWeightKg: 76.9,
            latestWeightDate: today,
            favorites: [
                favorite("oats", "Rolled oats", "Haferflocken", 187, german),
                favorite("yogurt", "Greek yogurt", "Griechischer Joghurt", 146, german),
                favorite("shake", "Whey protein shake", "Whey-Proteinshake", 114, german),
                favorite("chicken", "Chicken breast", "Pouletbrust", 165, german),
                favorite("banana", "Banana", "Banane", 107, german),
            ],
            generatedAt: Date()
        )
        return WatchState(
            snapshot: snapshot,
            mealTypes: ["Breakfast", "Lunch", "Dinner", "Snacks"],
            recents: [
                recent("salmon", "Salmon fillet", "Lachsfilet", 260, german),
                recent("bread", "Wholegrain bread", "Vollkornbrot", 140, german),
                recent("almonds", "Almonds", "Mandeln", 174, german),
                recent("blueberries", "Blueberries", "Heidelbeeren", 57, german),
            ],
            weight: WatchWeightInfo(latestKg: 76.9, latestDate: today, delta7dKg: -0.4),
            sleep: WatchSleepInfo(date: today, durationMinutes: 452, quality: 8),
            privateCloudComputeEnabled: false
        )
    }

    private static func favorite(
        _ key: String, _ en: String, _ de: String, _ calories: Double, _ german: Bool
    ) -> WidgetSnapshot.FavoriteFood {
        WidgetSnapshot.FavoriteFood(id: "demo-food-\(key)", name: german ? de : en, calories: calories)
    }

    private static func recent(
        _ key: String, _ en: String, _ de: String, _ calories: Double, _ german: Bool
    ) -> WatchFoodRef {
        WatchFoodRef(id: "demo-food-\(key)", name: german ? de : en, calories: calories)
    }
}

#endif
