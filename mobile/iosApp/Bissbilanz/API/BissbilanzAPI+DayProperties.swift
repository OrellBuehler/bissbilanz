import Foundation

extension BissbilanzAPI {
    // MARK: - Day Properties

    // The server exposes day properties as a single collection route keyed by a
    // `date` query parameter (GET/DELETE) and a PUT body — there is no `/{date}`
    // path segment and no POST handler.
    func getDayProperties(date: String) async throws -> DayProperties? {
        let response: DayPropertiesResponse = try await get("/api/day-properties", params: ["date": date])
        return response.properties
    }

    func getDayPropertiesRange(startDate: String, endDate: String) async throws -> [DayProperties] {
        let response: DayPropertiesRangeResponse = try await get("/api/day-properties", params: [
            "startDate": startDate,
            "endDate": endDate,
        ])
        return response.data
    }

    func setDayProperties(
        date: String,
        patch: DayPropertiesPatch,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> DayProperties {
        let body = DayPropertiesSet(date: date, patch: patch)
        let response: DayPropertiesResponse = try await put(
            "/api/day-properties", body: body,
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        guard let properties = response.properties else {
            throw APIError.serverError(200, "Server returned null properties for day \(date)")
        }
        return properties
    }

    func deleteDayProperties(
        date: String,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws {
        try await deleteRequest(
            "/api/day-properties?date=\(date)",
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
    }
}
