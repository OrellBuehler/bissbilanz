import Foundation
import SwiftData
import WidgetKit

/// Builds the compact "today" snapshot the widgets render from and pushes it
/// to the shared App Group store, then asks WidgetKit to reload timelines. The
/// same data also feeds the Apple Watch via `PhoneWatchConnectivity`.
///
/// Updates are debounced so bursts of writes (e.g. copying a whole day of
/// entries) produce a single snapshot write and widget reload.
@MainActor
enum WidgetSnapshotWriter {
    private static var pendingTask: Task<Void, Never>?

    /// Standard meal types the app always offers, in display order. These match
    /// the server's canonical casing (`DEFAULT_MEAL_TYPES`), which is what synced
    /// entries carry locally, so `watchMealTypes` recognizes them rather than
    /// re-appending them as "custom". The watch list starts from these and
    /// appends any custom meal types found in the log (see `watchMealTypes`).
    private static let standardMealTypes = ["Breakfast", "Lunch", "Dinner", "Snacks"]

    static func scheduleUpdate(context: ModelContext) {
        pendingTask?.cancel()
        pendingTask = Task {
            try? await Task.sleep(for: .milliseconds(500))
            guard !Task.isCancelled else { return }
            write(context: context)
        }
    }

    static func write(context: ModelContext) {
        let snapshot = buildSnapshot(context: context)
        WidgetSnapshotStore.save(snapshot)
        WidgetCenter.shared.reloadAllTimelines()
        PhoneWatchConnectivity.shared.sendState(buildWatchState(context: context, snapshot: snapshot))
    }

    /// Builds the snapshot from the current store without persisting it. Used
    /// both for the widget write and to reply to a watch log request with
    /// fresh totals.
    static func buildSnapshot(context: ModelContext) -> WidgetSnapshot {
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
            localeCode: L10n.currentLocale.rawValue,
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

    /// Assembles the watch payload: the widget snapshot plus the two things the
    /// watch's logging UI needs that the widgets don't — the meal-type list and
    /// a recents list.
    static func buildWatchState(context: ModelContext, snapshot: WidgetSnapshot? = nil) -> WatchState {
        let snapshot = snapshot ?? buildSnapshot(context: context)
        return WatchState(
            snapshot: snapshot,
            mealTypes: watchMealTypes(context: context),
            recents: watchRecents(context: context)
        )
    }

    /// Server-driven meal types, learned from the synced log: the standard set
    /// first, then any custom meal types the user has actually logged. Never a
    /// hardcoded-only list, so custom server meal types reach the watch.
    private static func watchMealTypes(context: ModelContext) -> [String] {
        let entries = (try? context.fetch(FetchDescriptor<LocalEntry>())) ?? []
        // Compare case-insensitively: optimistic, not-yet-synced entries can still
        // carry a client's lowercase casing, and we don't want those reappearing
        // as phantom "custom" duplicates of the standard set.
        let standardKeys = Set(standardMealTypes.map { $0.lowercased() })
        let custom = Set(entries.map(\.mealType))
            .filter { !standardKeys.contains($0.lowercased()) }
            .sorted()
        return standardMealTypes + custom
    }

    /// Recently logged foods (most recent first), derived from the local entry
    /// log the same way the in-app recents list is. Recipes are skipped — the
    /// watch logs by food id in Phase 1.
    private static func watchRecents(context: ModelContext, limit: Int = 10) -> [WatchFoodRef] {
        let descriptor = FetchDescriptor<LocalEntry>(predicate: #Predicate { $0.foodId != nil })
        let entries = ((try? context.fetch(descriptor)) ?? []).compactMap { $0.toEntry() }

        // Keep the most recent entry per food, ordered by when it was logged.
        var latestByFood: [String: Entry] = [:]
        for entry in entries {
            guard let foodId = entry.foodId else { continue }
            let stamp = entry.createdAt ?? entry.eatenAt ?? entry.date ?? ""
            let existingStamp = latestByFood[foodId].map { $0.createdAt ?? $0.eatenAt ?? $0.date ?? "" } ?? ""
            if latestByFood[foodId] == nil || stamp > existingStamp {
                latestByFood[foodId] = entry
            }
        }

        return latestByFood.values
            .sorted { ($0.createdAt ?? $0.date ?? "") > ($1.createdAt ?? $1.date ?? "") }
            .prefix(limit)
            .compactMap { entry -> WatchFoodRef? in
                guard let foodId = entry.foodId else { return nil }
                return WatchFoodRef(
                    id: foodId,
                    name: entry.displayName,
                    calories: entry.calories ?? entry.quickCalories ?? 0
                )
            }
    }
}
