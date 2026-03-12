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

struct CalendarDay: Codable {
    let date: String
    let calories: Double
    let hasGoal: Bool
    let metGoal: Bool
}

struct CalendarResponse: Codable {
    let data: [CalendarDay]
}

struct MaintenanceRequest: Codable {
    let startDate: String
    let endDate: String
    let bodyFatChangeRatio: Double?
}

struct MaintenanceResponse: Codable {
    let maintenanceCalories: Double
    let avgDailyCalories: Double
    let dailyDeficitSurplus: Double
    let weightChange: Double
    let startWeight: Double
    let endWeight: Double
    let totalDays: Int
    let weightEntryCount: Int
    let foodEntryDays: Int
    let coveragePercent: Double
    let fatChange: Double?
    let muscleChange: Double?
}

struct SupplementHistoryResponse: Codable {
    let history: [SupplementHistoryEntry]
}

struct SupplementHistoryEntry: Codable, Identifiable {
    let date: String
    let supplements: [SupplementHistoryItem]

    var id: String { date }
}

struct SupplementHistoryItem: Codable, Identifiable {
    let supplement: Supplement
    let taken: Bool
    let log: SupplementLog?

    var id: String { supplement.id }
}

struct MealTypeCreate: Codable {
    let name: String
}

struct MealTypesResponse: Codable {
    let mealTypes: [MealType]
}

struct MealTypeResponse: Codable {
    let mealType: MealType
}
