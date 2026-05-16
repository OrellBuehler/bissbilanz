import Foundation

struct FoodDiversityEntry: Codable {
    let date: String
    let foodId: String?
    let recipeId: String?
    let foodName: String
    let novaGroup: Int?
}

struct FoodDiversityResponse: Codable {
    let data: [FoodDiversityEntry]
}

struct MealTimingEntry: Codable {
    let date: String
    let mealType: String
    let eatenAt: String
    let foodId: String?
    let recipeId: String?
    let calories: Double
    let foodName: String
}

struct MealTimingResponse: Codable {
    let data: [MealTimingEntry]
}

struct DailyWeightFood: Codable {
    let date: String
    let calories: Double?
    let weightKg: Double?
    let movingAvg: Double?
}

struct DailyWeightFoodResponse: Codable {
    let data: [DailyWeightFood]
}

struct SleepFoodCorrelationEntry: Codable {
    let date: String
    let eveningCalories: Double?
    let sleepDurationMinutes: Int
    let sleepQuality: Int
}

struct SleepFoodCorrelationResponse: Codable {
    let data: [SleepFoodCorrelationEntry]
}

struct ExtendedNutrientEntry: Codable {
    let date: String
    let mealType: String
    let eatenAt: String
    let foodId: String?
    let recipeId: String?
    let foodName: String
    let calories: Double
    let protein: Double
    let carbs: Double
    let fat: Double
    let fiber: Double
    let novaGroup: Int?
    let omega3: Double?
    let omega6: Double?
    let sodium: Double?
    let caffeine: Double?
    let saturatedFat: Double?
    let transFat: Double?
    let vitaminC: Double?
    let vitaminD: Double?
    let vitaminE: Double?
    let alcohol: Double?
    let addedSugars: Double?
}

struct ExtendedNutrientResponse: Codable {
    let data: [ExtendedNutrientEntry]
}
