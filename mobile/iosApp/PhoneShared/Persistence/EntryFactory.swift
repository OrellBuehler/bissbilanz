import Foundation

/// Pure construction of an `Entry` from an `EntryCreate` plus the resolved
/// `Food`/`Recipe` it references — no SwiftData/repository dependency, so it's
/// shared between the app's `EntryRepository.createEntry` and the widget
/// extension's `QuickAddFoodIntent`.
enum EntryFactory {
    static func makeEntry(from create: EntryCreate, id: String, food: Food?, recipe: Recipe?) -> Entry {
        let recipeServings = (recipe?.totalServings).map { max($0, 1) } ?? 1
        return Entry(
            id: id,
            mealType: create.mealType,
            servings: create.servings,
            notes: create.notes,
            foodId: create.foodId,
            recipeId: create.recipeId,
            quickName: create.quickName,
            quickCalories: create.quickCalories,
            quickProtein: create.quickProtein,
            quickCarbs: create.quickCarbs,
            quickFat: create.quickFat,
            quickFiber: create.quickFiber,
            quickNutrients: create.quickNutrients,
            foodName: food?.name ?? recipe?.name,
            calories: food?.calories ?? recipe?.calories.map { $0 / recipeServings },
            protein: food?.protein ?? recipe?.protein.map { $0 / recipeServings },
            carbs: food?.carbs ?? recipe?.carbs.map { $0 / recipeServings },
            fat: food?.fat ?? recipe?.fat.map { $0 / recipeServings },
            fiber: food?.fiber ?? recipe?.fiber.map { $0 / recipeServings },
            servingSize: food?.servingSize,
            servingUnit: food?.servingUnit,
            date: create.date,
            eatenAt: create.eatenAt,
            createdAt: ISO8601DateFormatter().string(from: Date()),
            updatedAt: nil
        )
    }
}
