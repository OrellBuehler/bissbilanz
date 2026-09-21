import AppIntents
import CoreSpotlight
import Foundation

/// A recipe from the user's database, exposed to Siri, Spotlight and
/// Shortcuts. Mirrors `FoodEntity`; logging a recipe maps to `EntryCreate`'s
/// `recipeId`, the per-serving counterpart of logging a food.
struct RecipeEntity: AppEntity, IndexedEntity {
    let id: String
    let name: String
    let caloriesPerServing: Double?
    let imageUrl: String?

    init(recipe: Recipe) {
        id = recipe.id
        name = recipe.name
        let servings = max(recipe.totalServings, 1)
        caloriesPerServing = recipe.calories.map { $0 / servings }
        imageUrl = recipe.imageUrl
    }

    static var typeDisplayRepresentation: TypeDisplayRepresentation {
        TypeDisplayRepresentation(name: "Recipe")
    }

    static let defaultQuery = RecipeEntityQuery()

    var displayRepresentation: DisplayRepresentation {
        // Same confined disk cache as FoodEntity, and the same rule: never
        // download while the system is waiting for results.
        let image: DisplayRepresentation.Image = if let file = LocalImageStore.cachedFile(for: imageUrl) {
            .init(url: file)
        } else {
            .init(systemName: "book.closed")
        }
        guard let caloriesPerServing else {
            return DisplayRepresentation(title: "\(name)", image: image)
        }
        return DisplayRepresentation(
            title: "\(name)",
            subtitle: "\(Int(caloriesPerServing.rounded())) kcal / serving",
            image: image
        )
    }

    var attributeSet: CSSearchableItemAttributeSet {
        let set = defaultAttributeSet
        set.title = name
        if let caloriesPerServing {
            set.contentDescription = "\(Int(caloriesPerServing.rounded())) kcal / serving"
        }
        set.keywords = [name]
        return set
    }
}

struct RecipeEntityQuery: EntityStringQuery {
    @Dependency private var entryWriter: EntryWriter

    func entities(for identifiers: [String]) async throws -> [RecipeEntity] {
        await entryWriter.recipes(ids: identifiers).map(RecipeEntity.init)
    }

    func entities(matching string: String) async throws -> [RecipeEntity] {
        await entryWriter.searchRecipes(string).map(RecipeEntity.init)
    }

    func suggestedEntities() async throws -> [RecipeEntity] {
        await entryWriter.suggestedRecipes().map(RecipeEntity.init)
    }
}
