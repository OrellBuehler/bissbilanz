import Foundation

/// Matches the server's day-properties response object `{ date, isFastingDay }`
/// (camelCase, no userId) — see src/lib/server/validation/responses/day-properties.ts.
struct DayProperties: Codable {
    let date: String
    let isFastingDay: Bool
}

struct DayPropertiesResponse: Codable {
    let properties: DayProperties?
}

/// PUT /api/day-properties expects `{ date, isFastingDay }` (camelCase) — the date
/// travels in the body, not the URL path. See dayPropertiesSetSchema.
struct DayPropertiesSet: Codable {
    let date: String
    let isFastingDay: Bool
}
