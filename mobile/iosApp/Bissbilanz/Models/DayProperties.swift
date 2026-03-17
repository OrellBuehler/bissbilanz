import Foundation

struct DayProperties: Codable {
    let date: String
    let userId: String
    let isFastingDay: Bool

    enum CodingKeys: String, CodingKey {
        case date
        case userId = "user_id"
        case isFastingDay = "is_fasting_day"
    }
}

struct DayPropertiesResponse: Codable {
    let properties: DayProperties?
}

struct DayPropertiesSet: Codable {
    let isFastingDay: Bool

    enum CodingKeys: String, CodingKey {
        case isFastingDay = "is_fasting_day"
    }
}
