import Foundation

/// Compact "today" snapshot the app writes to the shared App Group container
/// after every data change. The widget extension renders exclusively from
/// this — it never touches the SwiftData store or the network.
struct WidgetSnapshot: Codable {
    struct Meal: Codable {
        let mealType: String
        let calories: Double
    }

    struct FavoriteFood: Codable, Identifiable {
        let id: String
        let name: String
        let calories: Double
    }

    /// ISO day ("yyyy-MM-dd") the consumed values refer to.
    let date: String
    /// In-app language ("en"/"de") so widgets match the app's localization.
    let localeCode: String
    let calories: Double
    let protein: Double
    let carbs: Double
    let fat: Double
    let fiber: Double
    let calorieGoal: Double
    let proteinGoal: Double
    let carbGoal: Double
    let fatGoal: Double
    let fiberGoal: Double
    /// Per-meal calorie totals for meals that have entries today.
    let meals: [Meal]
    let latestWeightKg: Double?
    let latestWeightDate: String?
    /// Favorite foods for the quick-access widget (name + kcal per serving).
    let favorites: [FavoriteFood]
    let generatedAt: Date
}

extension WidgetSnapshot {
    /// Sample data for widget gallery previews and as a graceful fallback
    /// when no snapshot has been written yet (or the App Group container is
    /// unavailable).
    static var placeholder: WidgetSnapshot {
        WidgetSnapshot(
            date: WidgetSnapshotStore.isoDateString(from: Date()),
            localeCode: "en",
            calories: 1430,
            protein: 96,
            carbs: 152,
            fat: 48,
            fiber: 21,
            calorieGoal: 2200,
            proteinGoal: 150,
            carbGoal: 250,
            fatGoal: 70,
            fiberGoal: 30,
            meals: [
                Meal(mealType: "breakfast", calories: 410),
                Meal(mealType: "lunch", calories: 620),
                Meal(mealType: "snacks", calories: 400),
            ],
            latestWeightKg: 78.4,
            latestWeightDate: WidgetSnapshotStore.isoDateString(from: Date()),
            favorites: [
                FavoriteFood(id: "1", name: "Oatmeal", calories: 350),
                FavoriteFood(id: "2", name: "Greek Yogurt", calories: 120),
                FavoriteFood(id: "3", name: "Protein Shake", calories: 220),
            ],
            generatedAt: Date()
        )
    }

    /// Consumed values are only valid for the day the snapshot was written.
    /// Rendered on any later day (e.g. right after midnight, before the app
    /// next runs) the day-bound values reset to zero while goals and
    /// reference data (weight, favorites) are kept.
    func resetIfStale(on referenceDate: Date) -> WidgetSnapshot {
        guard date != WidgetSnapshotStore.isoDateString(from: referenceDate) else { return self }
        return WidgetSnapshot(
            date: WidgetSnapshotStore.isoDateString(from: referenceDate),
            localeCode: localeCode,
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
            fiber: 0,
            calorieGoal: calorieGoal,
            proteinGoal: proteinGoal,
            carbGoal: carbGoal,
            fatGoal: fatGoal,
            fiberGoal: fiberGoal,
            meals: [],
            latestWeightKg: latestWeightKg,
            latestWeightDate: latestWeightDate,
            favorites: favorites,
            generatedAt: generatedAt
        )
    }
}

/// Reads and writes the snapshot in the shared App Group `UserDefaults`.
/// Both sides degrade gracefully when the suite is unavailable (e.g. a build
/// without the App Group entitlement): the app skips the write and widgets
/// fall back to placeholder data — never crash.
enum WidgetSnapshotStore {
    static let appGroupId = "group.com.bissbilanz"
    static let snapshotKey = "widget_snapshot_v1"

    private static let isoFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return formatter
    }()

    static func isoDateString(from date: Date) -> String {
        isoFormatter.string(from: date)
    }

    static func load() -> WidgetSnapshot? {
        guard let defaults = UserDefaults(suiteName: appGroupId),
              let data = defaults.data(forKey: snapshotKey)
        else { return nil }
        return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
    }

    static func save(_ snapshot: WidgetSnapshot) {
        guard let defaults = UserDefaults(suiteName: appGroupId),
              let data = try? JSONEncoder().encode(snapshot)
        else { return }
        defaults.set(data, forKey: snapshotKey)
    }
}
