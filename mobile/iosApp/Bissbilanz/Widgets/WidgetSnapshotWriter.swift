import Foundation
import SwiftData
import WidgetKit

/// Builds the compact "today" snapshot the widgets render from and pushes it
/// to the shared App Group store, then asks WidgetKit to reload timelines.
///
/// Updates are debounced so bursts of writes (e.g. copying a whole day of
/// entries) produce a single snapshot write and widget reload.
@MainActor
enum WidgetSnapshotWriter {
    private static var pendingTask: Task<Void, Never>?

    static func scheduleUpdate(context: ModelContext) {
        pendingTask?.cancel()
        pendingTask = Task {
            try? await Task.sleep(for: .milliseconds(500))
            guard !Task.isCancelled else { return }
            write(context: context)
        }
    }

    static func write(context: ModelContext) {
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

        let snapshot = WidgetSnapshot(
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

        WidgetSnapshotStore.save(snapshot)
        WidgetCenter.shared.reloadAllTimelines()
    }
}
