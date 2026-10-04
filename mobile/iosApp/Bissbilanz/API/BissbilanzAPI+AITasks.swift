import Foundation

extension BissbilanzAPI {
    // MARK: - AI Tasks

    func createAiTask(_ task: AiTaskCreate, idempotencyKey: String? = nil) async throws -> AiTask {
        for attempt in 0 ... 3 {
            do {
                let response: AiTaskResponse = try await post(
                    "/api/ai-tasks", body: task, idempotencyKey: idempotencyKey
                )
                return response.task
            } catch let pending as AiTaskRequestInProgress {
                guard attempt < 3 else { throw pending }
                try await Task.sleep(nanoseconds: UInt64(min(pending.retryAfter, 86400) * 1_000_000_000))
            }
        }
        throw AiTaskRequestInProgress(retryAfter: 60)
    }

    func listAiTasks(
        status: String? = nil,
        acknowledged: Bool? = nil,
        limit: Int? = nil,
        offset: Int? = nil
    ) async throws -> (tasks: [AiTask], total: Int) {
        var params: [String: String] = [:]
        if let status { params["status"] = status }
        if let acknowledged { params["acknowledged"] = acknowledged ? "true" : "false" }
        if let limit { params["limit"] = "\(limit)" }
        if let offset { params["offset"] = "\(offset)" }
        let response: AiTasksResponse = try await get("/api/ai-tasks", params: params)
        return (response.tasks, response.total)
    }

    func updateAiTask(
        id: String,
        _ update: AiTaskUpdate,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> AiTask {
        let response: AiTaskResponse = try await patch(
            "/api/ai-tasks/\(id)", body: update,
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
        return response.task
    }

    func deleteAiTask(
        id: String,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws {
        try await deleteRequest(
            "/api/ai-tasks/\(id)",
            idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt
        )
    }

    /// Clears the unread state on resolved tasks. Pass nil to acknowledge everything
    /// unacknowledged, which is what opening the list does.
    @discardableResult
    func acknowledgeAiTasks(ids: [String]? = nil) async throws -> Int {
        let response: AiTaskAcknowledgeResponse = try await post(
            "/api/ai-tasks/acknowledge", body: AiTaskAcknowledge(ids: ids)
        )
        return response.acknowledged
    }

    /// Uploads every photo of one meal in a single request — the route reads
    /// repeated `photo` parts and answers with the URLs in the order sent.
    func uploadAiTaskPhotos(_ photos: [(data: Data, filename: String)]) async throws -> [String] {
        let response: AiTaskPhotoResponse = try await postMultipart(
            "/api/ai-tasks/photo", fieldName: "photo", parts: photos
        )
        return response.photoUrls
    }

    // MARK: - MCP

    /// Whether the signed-in user has at least one MCP client (e.g. Claude,
    /// ChatGPT) authorized against their account, and which ones — see
    /// Settings → Connect an assistant. Local (anonymous) mode has no server
    /// and never calls this.
    func getMcpStatus() async throws -> McpStatusResponse {
        try await get("/api/mcp/status")
    }
}
