import Foundation

enum ScheduleType: String, Codable {
    case daily
    case everyOtherDay = "every_other_day"
    case weekly
    case specificDays = "specific_days"
}

struct Supplement: Codable, Identifiable {
    let id: String
    let userId: String
    let name: String
    let dosage: Double
    let dosageUnit: String
    let scheduleType: ScheduleType
    let scheduleDays: [Int]?
    let scheduleStartDate: String?
    let isActive: Bool
    let sortOrder: Int
    let timeOfDay: String?
    let createdAt: String?
    let updatedAt: String?
    let ingredients: [SupplementIngredient]?
}

struct SupplementIngredient: Codable, Identifiable {
    let id: String?
    let supplementId: String?
    let name: String
    let dosage: Double
    let dosageUnit: String
    let sortOrder: Int
}

struct SupplementLog: Codable, Identifiable {
    let id: String
    let supplementId: String
    let userId: String
    let date: String
    let takenAt: String
    let createdAt: String?
}

struct SupplementChecklist: Codable, Identifiable {
    let supplement: Supplement
    let taken: Bool
    let log: SupplementLog?

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
