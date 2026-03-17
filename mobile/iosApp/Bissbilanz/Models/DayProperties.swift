import Foundation

struct DayProperties: Codable {
    let date: String
    let userId: String
    let isFastingDay: Bool
}

struct DayPropertiesResponse: Codable {
    let properties: DayProperties?
}

struct DayPropertiesSet: Codable {
    let isFastingDay: Bool
}
