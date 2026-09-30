import Foundation

extension BissbilanzAPI {
    // MARK: - Entries

    func getEntries(date: String) async throws -> [Entry] {
        let response: EntriesResponse = try await get("/api/entries", params: ["date": date])
        return response.entries
    }

    func getEntriesRange(startDate: String, endDate: String) async throws -> [Entry] {
        let response: EntriesResponse = try await get("/api/entries/range", params: [
            "startDate": startDate,
            "endDate": endDate,
        ])
        return response.entries
    }

    func createEntry(
        _ entry: EntryCreate,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> Entry {
        let response: EntryResponse = try await post(
            "/api/entries", body: entry,
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.entry
    }

    func updateEntry(
        id: String,
        _ update: EntryUpdate,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> Entry {
        let response: EntryResponse = try await patch(
            "/api/entries/\(id)", body: update,
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.entry
    }

    func deleteEntry(
        id: String,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws {
        try await deleteRequest(
            "/api/entries/\(id)",
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
    }

    func copyEntries(fromDate: String, toDate: String) async throws -> [Entry] {
        let response: EntriesResponse = try await post(
            "/api/entries/copy?fromDate=\(fromDate)&toDate=\(toDate)",
            body: [String: String]()
        )
        return response.entries
    }
}
