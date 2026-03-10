import Foundation

struct MacroTotals: Codable {
    let calories: Double
    let protein: Double
    let carbs: Double
    let fat: Double
    let fiber: Double

    static let zero = MacroTotals(calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0)
}

struct DailyStatsEntry: Codable {
    let date: String
    let calories: Double
    let protein: Double
    let carbs: Double
    let fat: Double
    let fiber: Double
}

struct DailyStatsResponse: Codable {
    let data: [DailyStatsEntry]
    let goals: Goals?
}

struct WeeklyMonthlyStatsResponse: Codable {
    let stats: MacroTotals
}

struct MealBreakdownEntry: Codable {
    let mealType: String
    let calories: Double
    let protein: Double
    let carbs: Double
    let fat: Double
    let fiber: Double
}

struct MealBreakdownResponse: Codable {
    let data: [MealBreakdownEntry]
}

struct StreaksResponse: Codable {
    let currentStreak: Int
    let longestStreak: Int
}

struct TopFoodEntry: Codable, Identifiable {
    let foodId: String?
    let recipeId: String?
    let foodName: String
    let count: Int
    let calories: Double
    let protein: Double
    let carbs: Double
    let fat: Double
    let fiber: Double

    var id: String { foodId ?? recipeId ?? foodName }
}

struct TopFoodsResponse: Codable {
    let data: [TopFoodEntry]
}
