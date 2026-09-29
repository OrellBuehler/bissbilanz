import Foundation

extension BissbilanzAPI {
    // MARK: - Weight

    func getWeightEntries() async throws -> [WeightEntry] {
        let response: WeightEntriesResponse = try await get("/api/weight")
        return response.entries
    }

    func getLatestWeight() async throws -> WeightEntry? {
        do {
            let response: WeightLatestResponse? = try await get("/api/weight/latest")
            return response?.entry
        } catch {
            ErrorReporter.capture(error, context: ["endpoint": "/api/weight/latest"])
            return nil
        }
    }

    func createWeightEntry(
        _ entry: WeightCreate,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> WeightEntry {
        let response: WeightEntryResponse = try await post(
            "/api/weight", body: entry,
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.entry
    }

    func updateWeightEntry(
        id: String,
        _ update: WeightUpdate,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> WeightEntry {
        let response: WeightEntryResponse = try await patch(
            "/api/weight/\(id)", body: update,
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.entry
    }

    func deleteWeightEntry(
        id: String,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws {
        try await deleteRequest(
            "/api/weight/\(id)",
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
    }
}
