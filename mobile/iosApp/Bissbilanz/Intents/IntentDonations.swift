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

    /// Invoked with every date a write touched. Set once at launch
    /// (`BissbilanzApp.init`) to the `NutritionReader` that can turn a date into
    /// a `DaySummaryEntity`: `EntryRepository` knows nothing about goals or App
    /// Intents entities, and must not grow a dependency on either just to keep
    /// Spotlight in step. Single-writer like `isEnabled`.
    nonisolated(unsafe) static var onDayChanged: (@MainActor (Set<String>) -> Void)?

    /// The same for weight and sleep entries, keyed by entry id rather than by
    /// day: `WeightRepository`/`SleepRepository` know nothing about App Intents
    /// entities, so the launch wires these to the `BodyReader` that can build
    /// one. Single-writer like `isEnabled`.
    nonisolated(unsafe) static var onWeightChanged: (@MainActor (Set<String>) -> Void)?
    nonisolated(unsafe) static var onSleepChanged: (@MainActor (Set<String>) -> Void)?

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

    /// Reports the days a write changed so their Spotlight entries can be
    /// rebuilt. Called from `EntryRepository` after every entry / day-properties
    /// mutation and after a refresh replaced a day from the server.
    @MainActor
    static func dayChanged(_ dates: Set<String>) {
        guard isEnabled, !dates.isEmpty, let handler = onDayChanged else { return }
        handler(dates)
    }

    /// Push day summaries into the Spotlight index, where their natural-language
    /// `attributeSet` is what Siri matches a spoken question against.
    static func indexDays(_ summaries: [DaySummaryEntity]) {
        guard isEnabled, !summaries.isEmpty else { return }
        Task {
            try? await CSSearchableIndex.default().indexAppEntities(summaries)
        }
    }

    /// Drops days that no longer have anything to report (last entry deleted,
    /// fasting flag cleared), so a stale answer can't outlive the data.
    static func removeDays(_ dates: [String]) {
        guard isEnabled, !dates.isEmpty else { return }
        Task {
            try? await CSSearchableIndex.default()
                .deleteAppEntities(identifiedBy: dates, ofType: DaySummaryEntity.self)
        }
    }

    /// Reports the weight entries a write changed (created, edited, deleted,
    /// or replaced by the server copy of a `temp_` row) so their Spotlight
    /// entries can be rebuilt. Ids that no longer resolve are dropped from the
    /// index by the handler.
    @MainActor
    static func weightChanged(_ ids: Set<String>) {
        guard isEnabled, !ids.isEmpty, let handler = onWeightChanged else { return }
        handler(ids)
    }

    /// The same for sleep entries.
    @MainActor
    static func sleepChanged(_ ids: Set<String>) {
        guard isEnabled, !ids.isEmpty, let handler = onSleepChanged else { return }
        handler(ids)
    }

    /// Push weight entries into the Spotlight index, where their
    /// natural-language `attributeSet` is what Siri matches a spoken question
    /// against.
    static func indexWeights(_ entries: [WeightEntity]) {
        guard isEnabled, !entries.isEmpty else { return }
        Task {
            try? await CSSearchableIndex.default().indexAppEntities(entries)
        }
    }

    /// Drops weight entries that are gone, so a stale answer can't outlive the
    /// data.
    static func removeWeights(_ ids: [String]) {
        guard isEnabled, !ids.isEmpty else { return }
        Task {
            try? await CSSearchableIndex.default()
                .deleteAppEntities(identifiedBy: ids, ofType: WeightEntity.self)
        }
    }

    static func indexSleeps(_ entries: [SleepEntity]) {
        guard isEnabled, !entries.isEmpty else { return }
        Task {
            try? await CSSearchableIndex.default().indexAppEntities(entries)
        }
    }

    static func removeSleeps(_ ids: [String]) {
        guard isEnabled, !ids.isEmpty else { return }
        Task {
            try? await CSSearchableIndex.default()
                .deleteAppEntities(identifiedBy: ids, ofType: SleepEntity.self)
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
