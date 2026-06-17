import AppIntents
import CoreSpotlight
import Foundation

/// Feeds Siri suggestions and Spotlight from the app side: donate the matching
/// "log" intent after a manual log so Siri learns the user's habits, and push
/// foods/recipes into the Spotlight index so they're searchable system-wide.
///
/// Disabled by default and switched on once at app launch
/// (`BissbilanzApp.init`), so contexts that exercise `EntryRepository`
/// without a full app launch (SwiftUI previews, headless tooling) stay inert.
/// Every donation/indexing call is best-effort and swallows its errors, so it
/// never affects the log itself even when enabled.
enum IntentDonations {
    /// Set once on the main actor at launch; read on the main actor from the
    /// repository. Single-writer, so `nonisolated(unsafe)` is sound here.
    nonisolated(unsafe) static var isEnabled = false

    /// Donate + incrementally index after a single manual log. `mealType` is
    /// the wire value from the created entry; an unknown value simply donates
    /// without a meal.
    static func donateLog(food: Food?, recipe: Recipe?, mealType: String) {
        guard isEnabled else { return }
        let meal = MealTypeAppEnum(rawValue: mealType)
        if let food {
            let entity = FoodEntity(food: food)
            Task {
                let intent = LogFoodIntent()
                intent.food = entity
                intent.meal = meal
                intent.servings = 1
                try? await IntentDonationManager.shared.donate(intent: intent)
                try? await CSSearchableIndex.default().indexAppEntities([entity])
            }
        }
        if let recipe {
            let entity = RecipeEntity(recipe: recipe)
            Task {
                let intent = LogRecipeIntent()
                intent.recipe = entity
                intent.meal = meal
                intent.servings = 1
                try? await IntentDonationManager.shared.donate(intent: intent)
                try? await CSSearchableIndex.default().indexAppEntities([entity])
            }
        }
    }

    /// Reindex the searchable catalog (favorites + recents) into Spotlight.
    /// Called at launch / foreground so results exist before any manual log.
    static func indexCatalog(foods: [Food], recipes: [Recipe]) {
        guard isEnabled else { return }
        let foodEntities = foods.map(FoodEntity.init)
        let recipeEntities = recipes.map(RecipeEntity.init)
        guard !foodEntities.isEmpty || !recipeEntities.isEmpty else { return }
        Task {
            if !foodEntities.isEmpty {
                try? await CSSearchableIndex.default().indexAppEntities(foodEntities)
            }
            if !recipeEntities.isEmpty {
                try? await CSSearchableIndex.default().indexAppEntities(recipeEntities)
            }
        }
    }
}
