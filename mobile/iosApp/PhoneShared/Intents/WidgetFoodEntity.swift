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
        let ids = Set(identifiers)
        return await Self.fetchLocalFoods().filter { ids.contains($0.id) }
    }

    func entities(matching string: String) async throws -> [WidgetFoodEntity] {
        await Self.fetchLocalFoods().filter { $0.name.localizedCaseInsensitiveContains(string) }
    }

    func suggestedEntities() async throws -> [WidgetFoodEntity] {
        let foods = await Self.fetchLocalFoods()
        let favorites = foods.filter(\.isFavorite)
        let rest = foods.filter { !$0.isFavorite }
        return Array((favorites + rest).prefix(20))
    }

    /// Every on-device food, sorted by name, mapped to the Sendable
    /// `WidgetFoodEntity` *before* returning — the underlying `LocalFood`
    /// SwiftData rows are tied to this `@MainActor` call and must never cross
    /// back out to the callers above, which run off the main actor. Small
    /// enough (a personal food database) to fetch and filter in memory
    /// rather than building a SwiftData predicate per query.
    @MainActor
    fileprivate static func fetchLocalFoods() -> [WidgetFoodEntity] {
        let container = LocalStore.extensionContainer(cloudKitEnabled: AppModeSnapshot.isLocal) { error, context in
            QuickAddDiagnostics.record(phase: context["phase"] as? String ?? "widget_food_query", error: error)
        }
        let context = ModelContext(container)
        let rows = (try? context.fetch(FetchDescriptor<LocalFood>(sortBy: [SortDescriptor(\.name)]))) ?? []
        return rows.map(WidgetFoodEntity.init)
    }

    /// Fresh id → display-data map, for `WidgetFoodSelection` to resolve a
    /// saved widget configuration's picks against at render time rather than
    /// trusting the `WidgetFoodEntity` values WidgetKit cached when the pick
    /// was made (those can go stale between edits).
    @MainActor
    static func currentFoodsById() -> [String: WidgetSnapshot.FavoriteFood] {
        // `Dictionary(_:uniquingKeysWith:)`, not `uniqueKeysWithValues:` —
        // `id` uniqueness is enforced by every write path rather than a
        // schema constraint (see `LocalStore`'s CloudKit compatibility
        // note), so this stays crash-safe even if a duplicate ever slips
        // through.
        Dictionary(
            fetchLocalFoods().map {
                ($0.id, WidgetSnapshot.FavoriteFood(id: $0.id, name: $0.name, calories: $0.calories, imageUrl: $0.imageUrl))
            },
            uniquingKeysWith: { first, _ in first }
        )
    }
}
