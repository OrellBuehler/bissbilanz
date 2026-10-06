import AppIntents
import Foundation
import SwiftData

/// A food selectable when configuring the Favorites/Quick Add widgets (the
/// "Edit Widget" picker). Distinct from `Bissbilanz/Intents/FoodEntity.swift`:
/// that one resolves through `EntryWriter`'s `@Dependency`, which only
/// exists in the main app process (`AppDependencyManager`, set up in
/// `BissbilanzApp.init`). Widget *configuration* runs inside the widget
/// extension's own process instead — this reads the App Group SwiftData
/// store directly, the same way `QuickAddFoodIntent.perform()` does for
/// writes.
struct WidgetFoodEntity: AppEntity {
    let id: String
    let name: String
    let calories: Double
    let imageUrl: String?
    /// Not shown in `displayRepresentation` — only used to order
    /// `suggestedEntities()` favorites-first, mirroring
    /// `EntryWriter.suggestedFoods()`.
    let isFavorite: Bool

    init(id: String, name: String, calories: Double, imageUrl: String?, isFavorite: Bool = false) {
        self.id = id
        self.name = name
        self.calories = calories
        self.imageUrl = imageUrl
        self.isFavorite = isFavorite
    }

    init(_ food: LocalFood) {
        id = food.id
        name = food.name
        calories = food.calories
        imageUrl = food.toFood()?.imageUrl
        isFavorite = food.isFavorite
    }

    static var typeDisplayRepresentation: TypeDisplayRepresentation {
        TypeDisplayRepresentation(name: "Food")
    }

    static let defaultQuery = WidgetFoodEntityQuery()

    var displayRepresentation: DisplayRepresentation {
        let subtitle = "\(Int(calories.rounded())) kcal"
        // Same confined disk cache as `FoodEntity`/`WidgetFoodThumbnail` —
        // never download while the system is waiting on the picker.
        let image: DisplayRepresentation.Image = if let file = LocalImageStore.cachedFile(for: imageUrl) {
            .init(url: file)
        } else {
            .init(systemName: "fork.knife")
        }
        return DisplayRepresentation(title: "\(name)", subtitle: "\(subtitle)", image: image)
    }
}

/// Resolves `WidgetFoodEntity` values straight from the on-device store: ids
/// back to entities (the widget's saved picks), a typed string to candidates
/// (the "Add Food" search field), and favorites first as suggestions (shown
/// before the user types anything) — mirrors `FoodEntityQuery`'s shape and
/// `EntryWriter.suggestedFoods()`'s "favorites first" ordering.
struct WidgetFoodEntityQuery: EntityStringQuery {
    func entities(for identifiers: [String]) async throws -> [WidgetFoodEntity] {
        await Self.fetchLocalFoods(ids: identifiers)
    }

    func entities(matching string: String) async throws -> [WidgetFoodEntity] {
        await Self.fetchLocalFoods(matching: string)
    }

    func suggestedEntities() async throws -> [WidgetFoodEntity] {
        await Self.fetchSuggestedFoods()
    }

    /// The `LocalFood` SwiftData rows are tied to these `@MainActor` calls and
    /// must never cross back out to the callers above, which run off the main
    /// actor, so each maps to the Sendable `WidgetFoodEntity` before returning.
    /// Every read is bounded by a predicate and `fetchLimit`: the widget
    /// extension has a small memory budget and the catalog can hold 100k foods.
    @MainActor
    private static func makeContext() -> ModelContext {
        let container = LocalStore.extensionContainer(cloudKitEnabled: AppModeSnapshot.isLocal) { error, context in
            QuickAddDiagnostics.record(phase: context["phase"] as? String ?? "widget_food_query", error: error)
        }
        return ModelContext(container)
    }

    @MainActor
    private static func fetchLocalFoods(ids: [String]) -> [WidgetFoodEntity] {
        guard !ids.isEmpty else { return [] }
        let descriptor = FetchDescriptor<LocalFood>(
            predicate: #Predicate<LocalFood> { ids.contains($0.id) },
            sortBy: [SortDescriptor(\.name)]
        )
        let rows = (try? makeContext().fetch(descriptor)) ?? []
        return rows.map(WidgetFoodEntity.init)
    }

    @MainActor
    private static func fetchLocalFoods(matching string: String) -> [WidgetFoodEntity] {
        guard !string.isEmpty else { return [] }
        var descriptor = FetchDescriptor<LocalFood>(
            predicate: #Predicate<LocalFood> { $0.name.localizedStandardContains(string) },
            sortBy: [SortDescriptor(\.name)]
        )
        descriptor.fetchLimit = 50
        let rows = (try? makeContext().fetch(descriptor)) ?? []
        return rows.map(WidgetFoodEntity.init)
    }

    /// Favorites first, then the alphabetical head of the rest, 20 in all.
    @MainActor
    private static func fetchSuggestedFoods() -> [WidgetFoodEntity] {
        let context = makeContext()
        let limit = 20
        var favoritesDescriptor = FetchDescriptor<LocalFood>(
            predicate: #Predicate<LocalFood> { $0.isFavorite },
            sortBy: [SortDescriptor(\.name)]
        )
        favoritesDescriptor.fetchLimit = limit
        let favorites = (try? context.fetch(favoritesDescriptor)) ?? []
        var restDescriptor = FetchDescriptor<LocalFood>(
            predicate: #Predicate<LocalFood> { !$0.isFavorite },
            sortBy: [SortDescriptor(\.name)]
        )
        restDescriptor.fetchLimit = limit - favorites.count
        let rest = favorites.count < limit ? ((try? context.fetch(restDescriptor)) ?? []) : []
        return (favorites + rest).map(WidgetFoodEntity.init)
    }

    /// Fresh id → display-data map for the foods a saved widget configuration
    /// picked, for `WidgetFoodSelection` to resolve them against at render time
    /// rather than trusting the `WidgetFoodEntity` values WidgetKit cached when
    /// the pick was made (those can go stale between edits).
    @MainActor
    static func currentFoodsById(ids: [String]) -> [String: WidgetSnapshot.FavoriteFood] {
        // `Dictionary(_:uniquingKeysWith:)`, not `uniqueKeysWithValues:` —
        // `id` uniqueness is enforced by every write path rather than a
        // schema constraint (see `LocalStore`'s CloudKit compatibility
        // note), so this stays crash-safe even if a duplicate ever slips
        // through.
        Dictionary(
            fetchLocalFoods(ids: ids).map {
                ($0.id, WidgetSnapshot.FavoriteFood(id: $0.id, name: $0.name, calories: $0.calories, imageUrl: $0.imageUrl))
            },
            uniquingKeysWith: { first, _ in first }
        )
    }
}
