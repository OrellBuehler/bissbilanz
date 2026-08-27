import Foundation

/// Compact "today" snapshot the app writes to the shared App Group container
/// after every data change. Every widget renders from this — this file is
/// compiled into the phone app, the phone widget extension, the watch app
/// and the watch widget extension alike (see `Shared/` in project.yml).
/// The iOS widget extension (`BissbilanzWidgets`) never touches the network,
/// but it does write to the App Group SwiftData store directly for
/// interactive quick-add (`QuickAddFoodIntent`, in `PhoneShared/` — phone
/// targets only), rebuilding and re-caching this snapshot afterward so the
/// read path here stays unchanged. The watch never touches SwiftData; it
/// only ever reads this via `WatchState`.
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

    /// Real empty state for a live timeline: no snapshot has been written yet
    /// (fresh install before the first app run), the App Group container is
    /// unavailable (a build without the entitlement), or the stored blob
    /// failed to decode after a schema change.
    ///
    /// This must NOT be `placeholder` — that is fabricated sample data, and
    /// rendering it in `getTimeline` puts invented calories and an invented
    /// weight on the home screen and the watch face with nothing to mark them
    /// as not the user's. Its favorites also carry sample ids ("1", "2"),
    /// so a tap runs `QuickAddFoodIntent` into `foodNotFound` and does
    /// nothing. Zero goals render as empty rings (every widget guards
    /// `goal > 0`), and no favorites hits the widgets' own empty states.
    static func empty(on referenceDate: Date) -> WidgetSnapshot {
        WidgetSnapshot(
            date: WidgetSnapshotStore.isoDateString(from: referenceDate),
            localeCode: WidgetSnapshotStore.systemLocaleCode(),
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
            fiber: 0,
            calorieGoal: 0,
            proteinGoal: 0,
            carbGoal: 0,
            fatGoal: 0,
            fiberGoal: 0,
            meals: [],
            latestWeightKg: nil,
            latestWeightDate: nil,
            favorites: [],
            generatedAt: referenceDate
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

    /// Best guess at the app's language before any snapshot exists, so the
    /// empty state isn't stuck in English on a German device. The app's own
    /// stored choice wins as soon as it writes a snapshot.
    static func systemLocaleCode() -> String {
        Locale.preferredLanguages.first?.hasPrefix("de") == true ? "de" : "en"
    }

    /// The language every widget renders in: the app's stored choice, carried
    /// on the snapshot, or the device's until one has been written.
    static func currentLocaleCode() -> String {
        load()?.localeCode ?? systemLocaleCode()
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
