@testable import Bissbilanz
import Foundation

/// Fixture data for the `MealEstimator` evaluation suite
/// (`MealEstimationEvaluation`, `MealEstimatorEvaluationTests`): a small local
/// food database and ~24 meal descriptions in English and German with expected
/// kcal/macro ranges and expected local-food matches.
///
/// Deliberately free of `FoundationModels`/`Evaluations` types so it compiles
/// and can be sanity-checked (`MealEstimatorEvaluationTests.fixturesAreWellFormed`)
/// on every platform/compiler, regardless of Apple Intelligence availability.
enum MealEvalFixtures {
    /// One fixture case: a free-text meal description, the calorie/macro range
    /// the *whole* estimate (summed across items) is expected to fall in, and
    /// the food ids — if any — a reasonable estimate must match. Ranges are
    /// deliberately generous: this scores a real, non-deterministic language
    /// model's output, not a fixed calculation.
    struct Case: Codable, Sendable {
        let description: String
        let calorieRange: ClosedRange<Double>
        let proteinRange: ClosedRange<Double>
        let carbsRange: ClosedRange<Double>
        let fatRange: ClosedRange<Double>
        /// Food ids a good estimate must include among its matched items.
        /// Empty when nothing in `seedFoods` is a good match for this
        /// description — those cases are what "no hallucinated ids" scores.
        let expectedMatchedFoodIds: Set<String>
    }

    /// The personal food database every sample is evaluated against. Named in
    /// German or English to mirror how a real user's library mixes both, with
    /// English `labels` (see `Food.labels`) so `FoodSearchTool` can match a
    /// tool query in either language — `FoodRepository.searchLocal` matches by
    /// name substring OR by normalized label.
    static let seedFoods: [Food] = [
        food(id: "eval-banana", name: "Banane", labels: ["banana", "fruit"],
             calories: 90, protein: 1, carbs: 23, fat: 0, fiber: 3),
        food(id: "eval-egg", name: "Ei", labels: ["egg"],
             calories: 155, protein: 13, carbs: 1, fat: 11, fiber: 0),
        food(id: "eval-toast", name: "Toastbrot", labels: ["bread", "toast"],
             calories: 265, protein: 9, carbs: 49, fat: 3, fiber: 3),
        food(id: "eval-chicken-breast", name: "Hähnchenbrust", labels: ["chicken"],
             calories: 165, protein: 31, carbs: 0, fat: 4, fiber: 0),
        food(id: "eval-rice", name: "Reis", labels: ["rice"],
             calories: 130, protein: 3, carbs: 28, fat: 0, fiber: 0),
        food(id: "eval-apple", name: "Apfel", labels: ["apple", "fruit"],
             calories: 52, protein: 0, carbs: 14, fat: 0, fiber: 2),
        food(id: "eval-yogurt", name: "Joghurt", labels: ["yogurt"],
             calories: 61, protein: 4, carbs: 5, fat: 3, fiber: 0),
        food(id: "eval-salmon", name: "Lachs", labels: ["salmon", "fish"],
             calories: 208, protein: 20, carbs: 0, fat: 13, fiber: 0),
        food(id: "eval-avocado", name: "Avocado", labels: ["avocado"],
             calories: 160, protein: 2, carbs: 9, fat: 15, fiber: 7),
        food(id: "eval-oatmeal", name: "Haferflocken", labels: ["oats", "oatmeal"],
             calories: 389, protein: 17, carbs: 66, fat: 7, fiber: 10),
    ]

    static let cases: [Case] = [
        // MARK: English

        Case(description: "2 eggs and a slice of toast",
             calorieRange: 250 ... 480, proteinRange: 14 ... 32, carbsRange: 15 ... 45, fatRange: 8 ... 24,
             expectedMatchedFoodIds: ["eval-egg", "eval-toast"]),
        Case(description: "a banana",
             calorieRange: 70 ... 130, proteinRange: 0 ... 3, carbsRange: 15 ... 33, fatRange: 0 ... 2,
             expectedMatchedFoodIds: ["eval-banana"]),
        Case(description: "grilled chicken breast with rice",
             calorieRange: 300 ... 650, proteinRange: 30 ... 60, carbsRange: 20 ... 60, fatRange: 3 ... 20,
             expectedMatchedFoodIds: ["eval-chicken-breast", "eval-rice"]),
        Case(description: "a bowl of oatmeal with a banana",
             calorieRange: 250 ... 550, proteinRange: 8 ... 22, carbsRange: 40 ... 100, fatRange: 3 ... 15,
             expectedMatchedFoodIds: ["eval-oatmeal", "eval-banana"]),
        Case(description: "a slice of pepperoni pizza",
             calorieRange: 220 ... 450, proteinRange: 8 ... 22, carbsRange: 20 ... 45, fatRange: 8 ... 25,
             expectedMatchedFoodIds: []),
        Case(description: "an apple and a cup of yogurt",
             calorieRange: 90 ... 260, proteinRange: 3 ... 14, carbsRange: 15 ... 45, fatRange: 0 ... 12,
             expectedMatchedFoodIds: ["eval-apple", "eval-yogurt"]),
        Case(description: "salmon with avocado",
             calorieRange: 250 ... 600, proteinRange: 15 ... 40, carbsRange: 2 ... 20, fatRange: 15 ... 45,
             expectedMatchedFoodIds: ["eval-salmon", "eval-avocado"]),
        Case(description: "a large cheeseburger with fries",
             calorieRange: 700 ... 1300, proteinRange: 25 ... 55, carbsRange: 60 ... 140, fatRange: 30 ... 70,
             expectedMatchedFoodIds: []),
        Case(description: "three scrambled eggs",
             calorieRange: 200 ... 400, proteinRange: 15 ... 30, carbsRange: 0 ... 6, fatRange: 12 ... 30,
             expectedMatchedFoodIds: ["eval-egg"]),
        Case(description: "a green salad with grilled chicken",
             calorieRange: 200 ... 500, proteinRange: 20 ... 45, carbsRange: 5 ... 30, fatRange: 5 ... 30,
             expectedMatchedFoodIds: ["eval-chicken-breast"]),
        Case(description: "a bowl of white rice",
             calorieRange: 150 ... 400, proteinRange: 2 ... 10, carbsRange: 30 ... 90, fatRange: 0 ... 6,
             expectedMatchedFoodIds: ["eval-rice"]),
        Case(description: "a protein shake with a banana",
             calorieRange: 150 ... 400, proteinRange: 15 ... 40, carbsRange: 15 ... 45, fatRange: 0 ... 12,
             expectedMatchedFoodIds: ["eval-banana"]),

        // MARK: German

        Case(description: "zwei Eier und eine Scheibe Toast",
             calorieRange: 250 ... 480, proteinRange: 14 ... 32, carbsRange: 15 ... 45, fatRange: 8 ... 24,
             expectedMatchedFoodIds: ["eval-egg", "eval-toast"]),
        Case(description: "eine Banane",
             calorieRange: 70 ... 130, proteinRange: 0 ... 3, carbsRange: 15 ... 33, fatRange: 0 ... 2,
             expectedMatchedFoodIds: ["eval-banana"]),
        Case(description: "gegrillte Hähnchenbrust mit Reis",
             calorieRange: 300 ... 650, proteinRange: 30 ... 60, carbsRange: 20 ... 60, fatRange: 3 ... 20,
             expectedMatchedFoodIds: ["eval-chicken-breast", "eval-rice"]),
        Case(description: "eine Schüssel Haferflocken mit einer Banane",
             calorieRange: 250 ... 550, proteinRange: 8 ... 22, carbsRange: 40 ... 100, fatRange: 3 ... 15,
             expectedMatchedFoodIds: ["eval-oatmeal", "eval-banana"]),
        Case(description: "ein Stück Pizza Salami",
             calorieRange: 220 ... 450, proteinRange: 8 ... 22, carbsRange: 20 ... 45, fatRange: 8 ... 25,
             expectedMatchedFoodIds: []),
        Case(description: "ein Apfel und ein Becher Joghurt",
             calorieRange: 90 ... 260, proteinRange: 3 ... 14, carbsRange: 15 ... 45, fatRange: 0 ... 12,
             expectedMatchedFoodIds: ["eval-apple", "eval-yogurt"]),
        Case(description: "Lachs mit Avocado",
             calorieRange: 250 ... 600, proteinRange: 15 ... 40, carbsRange: 2 ... 20, fatRange: 15 ... 45,
             expectedMatchedFoodIds: ["eval-salmon", "eval-avocado"]),
        Case(description: "ein großer Cheeseburger mit Pommes",
             calorieRange: 700 ... 1300, proteinRange: 25 ... 55, carbsRange: 60 ... 140, fatRange: 30 ... 70,
             expectedMatchedFoodIds: []),
        Case(description: "drei Rühreier",
             calorieRange: 200 ... 400, proteinRange: 15 ... 30, carbsRange: 0 ... 6, fatRange: 12 ... 30,
             expectedMatchedFoodIds: ["eval-egg"]),
        Case(description: "ein grüner Salat mit gegrilltem Hähnchen",
             calorieRange: 200 ... 500, proteinRange: 20 ... 45, carbsRange: 5 ... 30, fatRange: 5 ... 30,
             expectedMatchedFoodIds: ["eval-chicken-breast"]),
        Case(description: "eine Schale weißer Reis",
             calorieRange: 150 ... 400, proteinRange: 2 ... 10, carbsRange: 30 ... 90, fatRange: 0 ... 6,
             expectedMatchedFoodIds: ["eval-rice"]),
        Case(description: "ein Proteinshake mit einer Banane",
             calorieRange: 150 ... 400, proteinRange: 15 ... 40, carbsRange: 15 ... 45, fatRange: 0 ... 12,
             expectedMatchedFoodIds: ["eval-banana"]),
    ]

    private static func food(
        id: String, name: String, labels: [String],
        calories: Double, protein: Double, carbs: Double, fat: Double, fiber: Double
    ) -> Food {
        try! JSONPatch.decode(Food.self, from: [
            "id": id,
            "userId": "u1",
            "name": name,
            "servingSize": 100,
            "servingUnit": "g",
            "calories": calories,
            "protein": protein,
            "carbs": carbs,
            "fat": fat,
            "fiber": fiber,
            "isFavorite": false,
            "labels": labels,
        ])
    }
}
