import Foundation

extension BissbilanzAPI {
    // MARK: - Sleep

    func getSleepEntries(from: String? = nil, to: String? = nil) async throws -> [SleepEntry] {
        var params: [String: String] = [:]
        if let from { params["from"] = from }
        if let to { params["to"] = to }
        let response: SleepEntriesResponse = try await get("/api/sleep", params: params)
        return response.entries
    }

    func createSleepEntry(
        _ entry: SleepCreate,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> SleepEntry {
        let response: SleepEntryResponse = try await post(
            "/api/sleep", body: entry,
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.entry
    }

    func updateSleepEntry(
        id: String,
        _ update: SleepUpdate,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> SleepEntry {
        let response: SleepEntryResponse = try await patch(
            "/api/sleep/\(id)", body: update,
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.entry
    }

    func deleteSleepEntry(
        id: String,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws {
        try await deleteRequest(
            "/api/sleep/\(id)",
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
    }
}
