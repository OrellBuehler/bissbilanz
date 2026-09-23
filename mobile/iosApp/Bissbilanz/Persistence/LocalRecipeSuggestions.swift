import Foundation
import shared

/// Ranks the user's recipes against the day's remaining calorie/macro budget
/// using the shared Kotlin algorithm (`RecipeSuggestionsKt.suggestRecipes`) —
/// the same ranking Android and the web app produce, so all three agree by
/// construction. Mirrors the bridging style of `LocalInsights`/`LocalMaintenance`.
enum LocalRecipeSuggestions {
    struct Suggestion: Identifiable {
        let id: String
        let servings: Double
        let calories: Double
        let protein: Double
        let carbs: Double
        let fat: Double
        let fiber: Double
        let fit: Int
    }

    /// The calorie floor under which the shared calculator returns no
    /// suggestions at all — the screen's "goal reached" state.
    static let minRemainingCalories = RecipeSuggestionsKt.MIN_REMAINING_CALORIES

    /// `remaining` is today's goal minus what's already logged (can be
    /// negative). `recipes` supplies whole-recipe totals exactly as the
    /// repository returns them — a recipe with no macros yet contributes a
    /// zero-calorie candidate, which the shared calculator skips on its own.
    static func suggest(
        remaining: (calories: Double, protein: Double, carbs: Double, fat: Double),
        recipes: [Recipe],
        limit: Int32 = RecipeSuggestionsKt.DEFAULT_SUGGESTION_LIMIT
    ) -> [Suggestion] {
        let candidates = recipes.map(candidate(for:))
        let budget = MacroBudget(
            calories: remaining.calories,
            protein: remaining.protein,
            carbs: remaining.carbs,
            fat: remaining.fat
        )
        let results = RecipeSuggestionsKt.suggestRecipes(remaining: budget, candidates: candidates, limit: limit)
        return results.map { suggestion in
            Suggestion(
                id: suggestion.id,
                servings: suggestion.servings,
                calories: suggestion.macros.calories,
                protein: suggestion.macros.protein,
                carbs: suggestion.macros.carbs,
                fat: suggestion.macros.fat,
                fiber: suggestion.macros.fiber,
                fit: Int(suggestion.fit)
            )
        }
    }

    private static func candidate(for recipe: Recipe) -> SuggestionCandidate {
        let perServing = RecipeSuggestionsKt.perServingMacros(
            totalServings: recipe.totalServings,
            calories: recipe.calories ?? 0,
            protein: recipe.protein ?? 0,
            carbs: recipe.carbs ?? 0,
            fat: recipe.fat ?? 0,
            fiber: recipe.fiber ?? 0
        )
        return SuggestionCandidate(
            id: recipe.id,
            name: recipe.name,
            perServing: perServing,
            isFavorite: recipe.isFavorite
        )
    }
}
