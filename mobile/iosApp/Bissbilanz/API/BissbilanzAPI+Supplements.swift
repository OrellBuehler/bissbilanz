import Foundation

extension BissbilanzAPI {
    // MARK: - Supplements

    /// `all: true` also returns archived supplements — the default list is
    /// active-only, which silently loses rows in a full account download.
    func getSupplements(all: Bool = false) async throws -> [Supplement] {
        let response: SupplementsResponse = try await get(
            "/api/supplements",
            params: all ? ["all": "true"] : [:]
        )
        return response.supplements
    }

    func createSupplement(
        _ supplement: SupplementCreate,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> Supplement {
        let response: SupplementResponse = try await post(
            "/api/supplements", body: supplement,
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.supplement
    }

    func updateSupplement(
        id: String,
        _ update: SupplementUpdate,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> Supplement {
        let response: SupplementResponse = try await patch(
            "/api/supplements/\(id)", body: update,
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.supplement
    }

    func deleteSupplement(
        id: String,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws {
        try await deleteRequest(
            "/api/supplements/\(id)",
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
    }

    func getSupplementChecklist(date: String) async throws -> [SupplementChecklist] {
        let response: SupplementChecklistResponse = try await get("/api/supplements/\(date)/checklist")
        return response.checklist
    }

    func logSupplement(
        id: String,
        date: String,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> SupplementLog {
        let response: SupplementLogResponse = try await post(
            "/api/supplements/\(id)/log", body: ["date": date],
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.log
    }

    func unlogSupplement(
        id: String,
        date: String,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws {
        try await deleteRequest(
            "/api/supplements/\(id)/log/\(date)",
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
    }

    func getSupplementHistory(startDate: String, endDate: String) async throws -> [SupplementHistoryEntry] {
        let response: SupplementHistoryResponse = try await get("/api/supplements/history", params: [
            "from": startDate,
            "to": endDate,
        ])
        return response.history
    }
}
