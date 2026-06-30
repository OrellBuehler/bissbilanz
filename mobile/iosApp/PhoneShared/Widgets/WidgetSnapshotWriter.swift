import Foundation
import SwiftData
import WidgetKit

/// Builds the compact "today" snapshot the widgets render from and pushes it
/// to the shared App Group store, then asks WidgetKit to reload timelines.
///
/// This type is compiled into both the app and the widget extension, so it
/// must stay free of app-only dependencies: no `L10n` (backed by
/// `UserDefaults.standard`, unreachable from the extension — callers pass
/// `localeCode` in instead) and no `PhoneWatchConnectivity` (Apple's
/// WatchConnectivity docs prohibit `WCSession` use from app extensions — the
/// watch-push wrapper around `write`/`scheduleUpdate` lives app-only in
/// `Bissbilanz/Widgets/WidgetSnapshotWriter+App.swift`).
@MainActor
enum WidgetSnapshotWriter {
    /// Saves the snapshot to the App Group store and asks WidgetKit to reload
    /// every widget's timeline. Portable — safe to call from the widget
    /// extension process after a quick-add write.
    static func saveAndReload(_ snapshot: WidgetSnapshot) {
        WidgetSnapshotStore.save(snapshot)
        WidgetCenter.shared.reloadAllTimelines()
    }

    /// Builds the snapshot from the current store without persisting it. Used
    /// both for the widget write and to reply to a watch log request with
    /// fresh totals. `localeCode` is supplied by the caller (the app reads
    /// `L10n.currentLocale`; the widget extension reads the locale already
    /// cached in the on-disk snapshot) rather than read internally, since this
    /// type has no access to the app's `UserDefaults.standard`-backed locale.
    static func buildSnapshot(context: ModelContext, localeCode: String) -> WidgetSnapshot {
        let today = DateFormatting.today

        let entryDescriptor = FetchDescriptor<LocalEntry>(predicate: #Predicate { $0.date == today })
        let entries = ((try? context.fetch(entryDescriptor)) ?? []).compactMap { $0.toEntry() }

        let goals = ((try? context.fetch(FetchDescriptor<LocalGoals>())) ?? [])
            .first?.toGoals() ?? .defaults

        var weightDescriptor = FetchDescriptor<LocalWeightEntry>(
            sortBy: [SortDescriptor(\.entryDate, order: .reverse)]
        )
        weightDescriptor.fetchLimit = 1
        let latestWeight = (try? context.fetch(weightDescriptor))?.first

        let favoritesDescriptor = FetchDescriptor<LocalFood>(
            predicate: #Predicate { $0.isFavorite },
            sortBy: [SortDescriptor(\.name)]
        )
        let favorites = (try? context.fetch(favoritesDescriptor)) ?? []

        let mealTotals = Dictionary(grouping: entries, by: \.mealType)
            .map { WidgetSnapshot.Meal(mealType: $0.key, calories: $0.value.reduce(0) { $0 + $1.totalCalories }) }
            .sorted { $0.mealType < $1.mealType }

        return WidgetSnapshot(
            date: today,
            localeCode: localeCode,
            calories: entries.reduce(0) { $0 + $1.totalCalories },
            protein: entries.reduce(0) { $0 + $1.totalProtein },
            carbs: entries.reduce(0) { $0 + $1.totalCarbs },
            fat: entries.reduce(0) { $0 + $1.totalFat },
            fiber: entries.reduce(0) { $0 + $1.totalFiber },
            calorieGoal: goals.calorieGoal,
            proteinGoal: goals.proteinGoal,
            carbGoal: goals.carbGoal,
            fatGoal: goals.fatGoal,
            fiberGoal: goals.fiberGoal,
            meals: mealTotals,
            latestWeightKg: latestWeight?.weightKg,
            latestWeightDate: latestWeight?.entryDate,
            favorites: favorites.prefix(12).map {
                WidgetSnapshot.FavoriteFood(id: $0.id, name: $0.name, calories: $0.calories)
            },
            generatedAt: Date()
        )
    }
}
