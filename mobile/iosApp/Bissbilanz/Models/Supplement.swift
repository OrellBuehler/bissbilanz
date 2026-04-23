import Foundation

enum ScheduleType: String, Codable {
    case daily
    case everyOtherDay = "every_other_day"
    case weekly
    case specificDays = "specific_days"
}

enum FoodKind: String, Codable {
    case food
    case supplement
}

struct SupplementBackingFood: Codable, Identifiable {
    let id: String
    let name: String
    let brand: String?
    let kind: FoodKind
    let servingSize: Double
    let servingUnit: String
    let calories: Double
    let protein: Double
    let carbs: Double
    let fat: Double
    let fiber: Double
    let ingredientsText: String?
}

struct Supplement: Codable, Identifiable {
    let id: String
    let userId: String
    let name: String
    let scheduleType: ScheduleType
    let scheduleDays: [Int]?
    let scheduleStartDate: String?
    let isActive: Bool
    let sortOrder: Int
    let timeOfDay: String?
    let createdAt: String?
    let updatedAt: String?
    let ingredients: [SupplementIngredient]
}

struct SupplementIngredient: Codable, Identifiable {
    let id: String
    let supplementId: String
    let foodId: String
    let servings: Double
    let sortOrder: Int
    let food: SupplementBackingFood
}

struct SupplementLog: Codable {
    let supplementId: String
    let date: String
    let takenAt: String
    let entryIds: [String]
}

struct SupplementChecklist: Codable, Identifiable {
    let supplement: Supplement
    let taken: Bool
    let takenAt: String?

    var id: String { supplement.id }
}

struct SupplementsResponse: Codable {
    let supplements: [Supplement]
}

struct SupplementResponse: Codable {
    let supplement: Supplement
}

struct SupplementLogResponse: Codable {
    let log: SupplementLog
}

struct SupplementChecklistResponse: Codable {
    let checklist: [SupplementChecklist]
}

struct SupplementCreate: Codable {
    let name: String
    let scheduleType: ScheduleType
    var scheduleDays: [Int]?
    var scheduleStartDate: String?
    var isActive: Bool?
    var sortOrder: Int?
    var timeOfDay: String?
    let ingredients: [SupplementIngredientInput]
}

struct SupplementUpdate: Codable {
    var name: String?
    var scheduleType: ScheduleType?
    var scheduleDays: [Int]?
    var scheduleStartDate: String?
    var isActive: Bool?
    var sortOrder: Int?
    var timeOfDay: String?
    var ingredients: [SupplementIngredientInput]?
}

struct SupplementIngredientInput: Codable {
    var foodId: String?
    var food: SupplementBackingFoodInput?
    var servings: Double?
    var sortOrder: Int?
}

// Inline backing food payload — kept minimal to match the web form; the server
// normalises any missing macro fields to zero.
struct SupplementBackingFoodInput: Codable {
    let name: String
    let servingSize: Double
    let servingUnit: String
    let calories: Double
    let protein: Double
    let carbs: Double
    let fat: Double
    let fiber: Double
    var ingredientsText: String?
}
