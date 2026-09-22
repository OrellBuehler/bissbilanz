import AppIntents
import Foundation
import SwiftData

/// A favorite or recently logged food, offered when configuring the Quick
/// Add control (`AppIntentControlConfiguration` in
/// `BissbilanzWidgets/ControlCenterControls.swift`). The control's "add"
/// configuration sheet runs in the widget extension's process, so — like
/// `QuickAddFoodIntent` — this resolves against the extension's own SwiftData
/// container (the App Group store) rather than `FoodEntity`/`FoodEntityQuery`,
/// which depend on the app-only `EntryWriter` and its network search.
struct QuickAddFoodEntity: AppEntity {
    let id: String
    let name: String
    let calories: Double

    static var typeDisplayRepresentation: TypeDisplayRepresentation {
        TypeDisplayRepresentation(name: "Food")
    }

    static let defaultQuery = QuickAddFoodEntityQuery()

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)", subtitle: "\(Int(calories.rounded())) kcal")
    }
}

/// Resolves `QuickAddFoodEntity` values from the local store only — favorites
/// first, then recently logged foods (the same recency rule
/// `FoodRepository.localRecentFoods` uses, reimplemented here rather than
/// shared so this type stays free of that app-only class's dependencies).
struct QuickAddFoodEntityQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [QuickAddFoodEntity] {
        let context = ModelContext(Self.extensionContainer())
        var results: [QuickAddFoodEntity] = []
        for id in identifiers {
            var descriptor = FetchDescriptor<LocalFood>(predicate: #Predicate<LocalFood> { $0.id == id })
            descriptor.fetchLimit = 1
            guard let row = (try? context.fetch(descriptor))?.first else { continue }
            results.append(QuickAddFoodEntity(id: row.id, name: row.name, calories: row.calories))
        }
        return results
    }

    func suggestedEntities() async throws -> [QuickAddFoodEntity] {
        let context = ModelContext(Self.extensionContainer())

        var favoritesDescriptor = FetchDescriptor<LocalFood>(
            predicate: #Predicate<LocalFood> { $0.isFavorite },
            sortBy: [SortDescriptor(\.name)]
        )
        favoritesDescriptor.fetchLimit = 20
        let favorites = (try? context.fetch(favoritesDescriptor)) ?? []

        let entryDescriptor = FetchDescriptor<LocalEntry>(predicate: #Predicate<LocalEntry> { $0.foodId != nil })
        let entries = (try? context.fetch(entryDescriptor)) ?? []
        var lastDateByFood: [String: String] = [:]
        for entry in entries {
            guard let foodId = entry.foodId else { continue }
            if let current = lastDateByFood[foodId], current >= entry.date { continue }
            lastDateByFood[foodId] = entry.date
        }
        let recentIds = lastDateByFood.sorted { $0.value > $1.value }.prefix(20).map(\.key)
        let allFoods = (try? context.fetch(FetchDescriptor<LocalFood>())) ?? []
        let foodsById = Dictionary(uniqueKeysWithValues: allFoods.map { ($0.id, $0) })
        let recents = recentIds.compactMap { foodsById[$0] }

        var seenIds = Set<String>()
        let merged = (favorites + recents).filter { seenIds.insert($0.id).inserted }
        return merged.prefix(20).map { QuickAddFoodEntity(id: $0.id, name: $0.name, calories: $0.calories) }
    }

    private static func extensionContainer() -> ModelContainer {
        LocalStore.extensionContainer(
            cloudKitEnabled: AppModeSnapshot.isLocal,
            onError: { error, context in
                QuickAddDiagnostics.record(phase: context["phase"] as? String ?? "quick_add_control_query", error: error)
            }
        )
    }
}
