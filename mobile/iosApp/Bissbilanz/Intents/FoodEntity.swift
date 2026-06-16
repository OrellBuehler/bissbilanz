import AppIntents
import CoreSpotlight
import Foundation

/// A food from the user's database, exposed to Siri, Spotlight and Shortcuts.
///
/// Conforms to `IndexedEntity` so the same value can be pushed into the
/// Spotlight index (iOS 18) — selecting a result then runs `OpenFoodIntent`.
/// Only the fields the system actually shows are carried; the full `Food`
/// (macros, etc.) is looked up from the store at log time via `EntryWriter`.
struct FoodEntity: AppEntity, IndexedEntity {
    let id: String
    let name: String
    let brand: String?
    let calories: Double

    init(food: Food) {
        id = food.id
        name = food.name
        brand = food.brand
        calories = food.calories
    }

    static var typeDisplayRepresentation: TypeDisplayRepresentation {
        TypeDisplayRepresentation(name: "Food")
    }

    static let defaultQuery = FoodEntityQuery()

    var displayRepresentation: DisplayRepresentation {
        let kcal = "\(Int(calories.rounded())) kcal"
        let subtitle = [brand, kcal].compactMap { $0 }.joined(separator: " · ")
        return DisplayRepresentation(title: "\(name)", subtitle: "\(subtitle)")
    }

    /// Spotlight metadata, layered on top of the framework default so the title
    /// and a macro hint show in search results.
    var attributeSet: CSSearchableItemAttributeSet {
        let set = defaultAttributeSet
        set.title = name
        set.contentDescription = [brand, "\(Int(calories.rounded())) kcal"]
            .compactMap { $0 }
            .joined(separator: " · ")
        set.keywords = [name, brand].compactMap { $0 }
        return set
    }
}

/// Resolves `FoodEntity` values for the framework: stored ids back to entities,
/// a spoken/typed string to candidates (multiple → automatic disambiguation),
/// and a suggestion list shown before the user types.
struct FoodEntityQuery: EntityStringQuery {
    @Dependency private var entryWriter: EntryWriter

    func entities(for identifiers: [String]) async throws -> [FoodEntity] {
        await entryWriter.foods(ids: identifiers).map(FoodEntity.init)
    }

    func entities(matching string: String) async throws -> [FoodEntity] {
        await entryWriter.searchFoods(string).map(FoodEntity.init)
    }

    func suggestedEntities() async throws -> [FoodEntity] {
        await entryWriter.suggestedFoods().map(FoodEntity.init)
    }
}
