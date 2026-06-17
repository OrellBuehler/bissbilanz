import AppIntents
import Foundation

/// "Hey Siri, log a banana with Bissbilanz." Creates a food entry without
/// opening the app (`openAppWhenRun = false`); the write goes through the same
/// offline-first path as the in-app quick-log, so it persists in Local mode and
/// uploads when online.
struct LogFoodIntent: AppIntent {
    static var title: LocalizedStringResource {
        "Log Food"
    }

    static var description: IntentDescription {
        IntentDescription("Log a food from your Bissbilanz database to today's diary.")
    }

    /// Log silently — the result dialog is the only feedback.
    static var openAppWhenRun: Bool {
        false
    }

    @Parameter(title: "Food")
    var food: FoodEntity

    @Parameter(title: "Meal")
    var meal: MealTypeAppEnum?

    @Parameter(title: "Servings", default: 1.0)
    var servings: Double

    @Dependency
    private var entryWriter: EntryWriter

    static var parameterSummary: some ParameterSummary {
        Summary("Log \(\.$food)") {
            \.$meal
            \.$servings
        }
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let resolvedMeal = meal ?? .forCurrentTime()
        let entry = try await entryWriter.logFood(id: food.id, meal: resolvedMeal, servings: servings)
        let calories = entry.totalCalories > 0 ? entry.totalCalories : food.calories * servings
        let dialog = L10n.intentLoggedFood(food.name, meal: resolvedMeal.serverValue, calories: Int(calories.rounded()))
        return .result(dialog: "\(dialog)")
    }
}
