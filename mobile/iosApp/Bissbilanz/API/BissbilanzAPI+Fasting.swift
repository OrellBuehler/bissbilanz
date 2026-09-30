import Foundation

extension BissbilanzAPI {
    // MARK: - Fasting

    /// Finished fasts, newest first — used to pull fasts logged elsewhere
    /// (the web app, another device) into the local history. `from`/`to` are
    /// ISO 8601 instants filtering on `startedAt`; all params are optional.
    func listFastingSessions(
        from: String? = nil,
        to: String? = nil,
        limit: Int? = nil
    ) async throws -> [FastingSessionRemote] {
        var params: [String: String] = [:]
        if let from { params["from"] = from }
        if let to { params["to"] = to }
        if let limit { params["limit"] = String(limit) }
        let response: FastingSessionsResponse = try await get("/api/fasts", params: params)
        return response.sessions
    }

    func upsertFastingSession(
        _ session: FastingSessionUpsert,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> FastingSessionRemote {
        let response: FastingSessionResponse = try await post(
            "/api/fasts", body: session,
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.session
    }

    func deleteFastingSession(
        id: String,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws {
        try await deleteRequest(
            "/api/fasts/\(id)",
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
    }
}
