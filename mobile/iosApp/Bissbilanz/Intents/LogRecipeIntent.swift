import AppIntents
import Foundation

/// Recipe counterpart of `LogFoodIntent` — logs one serving (by default) of a
/// recipe to today's diary without opening the app.
struct LogRecipeIntent: AppIntent {
    static var title: LocalizedStringResource {
        "Log Recipe"
    }

    static var description: IntentDescription {
        IntentDescription("Log a recipe from your Bissbilanz database to today's diary.")
    }

    static var openAppWhenRun: Bool {
        false
    }

    @Parameter(title: "Recipe")
    var recipe: RecipeEntity

    @Parameter(title: "Meal")
    var meal: MealTypeAppEnum?

    @Parameter(title: "Servings", default: 1.0)
    var servings: Double

    @Dependency
    private var entryWriter: EntryWriter

    static var parameterSummary: some ParameterSummary {
        Summary("Log \(\.$recipe)") {
            \.$meal
            \.$servings
        }
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let resolvedMeal = meal ?? .forCurrentTime()
        let entry = try await entryWriter.logRecipe(id: recipe.id, meal: resolvedMeal, servings: servings)
        let perServing = recipe.caloriesPerServing ?? 0
        let calories = entry.totalCalories > 0 ? entry.totalCalories : perServing * servings
        let dialog = L10n.intentLoggedFood(
            recipe.name,
            meal: resolvedMeal.serverValue,
            calories: Int(calories.rounded())
        )
        return .result(dialog: "\(dialog)")
    }
}
