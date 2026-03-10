import Foundation

struct Entry: Codable, Identifiable {
    let id: String
    let userId: String?
    let foodId: String?
    let recipeId: String?
    let date: String
    let mealType: String
    let servings: Double
    let notes: String?
    let quickName: String?
    let quickCalories: Double?
    let quickProtein: Double?
    let quickCarbs: Double?
    let quickFat: Double?
    let quickFiber: Double?
    let eatenAt: String?
    let createdAt: String?
    let updatedAt: String?
    let food: Food?
    let recipe: Recipe?

    var displayName: String {
        food?.name ?? recipe?.name ?? quickName ?? "Unknown"
    }

    var totalCalories: Double {
        if let food {
            return food.calories * servings
        }
        if let recipe, let cal = recipe.calories {
            return cal * servings
        }
        return (quickCalories ?? 0) * servings
    }

    var totalProtein: Double {
        if let food {
            return food.protein * servings
        }
        if let recipe, let val_ = recipe.protein {
            return val_ * servings
        }
        return (quickProtein ?? 0) * servings
    }

    var totalCarbs: Double {
        if let food {
            return food.carbs * servings
        }
        if let recipe, let val_ = recipe.carbs {
            return val_ * servings
        }
        return (quickCarbs ?? 0) * servings
    }

    var totalFat: Double {
        if let food {
            return food.fat * servings
        }
        if let recipe, let val_ = recipe.fat {
            return val_ * servings
        }
        return (quickFat ?? 0) * servings
    }

    var totalFiber: Double {
        if let food {
            return food.fiber * servings
        }
        if let recipe, let val_ = recipe.fiber {
            return val_ * servings
        }
        return (quickFiber ?? 0) * servings
    }
}

struct EntryCreate: Codable {
    var foodId: String?
    var recipeId: String?
    let mealType: String
    let servings: Double
    let date: String
    var notes: String?
    var quickName: String?
    var quickCalories: Double?
    var quickProtein: Double?
    var quickCarbs: Double?
    var quickFat: Double?
    var quickFiber: Double?
    var eatenAt: String?
}

struct EntryUpdate: Codable {
    var mealType: String?
    var servings: Double?
    var date: String?
    var notes: String?
}

struct EntriesResponse: Codable {
    let entries: [Entry]
}

struct EntryResponse: Codable {
    let entry: Entry
}
