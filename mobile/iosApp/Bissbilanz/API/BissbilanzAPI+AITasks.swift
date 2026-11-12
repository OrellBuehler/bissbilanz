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

    /// Logs exactly the given `itemIds` of Claude's proposal. 400, 404 or 409
    /// means the proposal is no longer open or its items changed (already
    /// accepted, the task changed, the processor moved away from Claude, or a
    /// proposed food, recipe or meal type was deleted).
    func acceptAiTaskProposal(id: String, itemIds: [String]) async throws -> AiTask {
        let response: AiTaskResponse = try await post(
            "/api/ai-tasks/\(id)/proposal/accept",
            body: AiTaskProposalAccept(itemIds: itemIds)
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

    /// Marks exactly these answers of Claude read. Sent without `ids`, so no
    /// task — and no dismissal the user has not seen — is acknowledged on the
    /// side. At most `aiTaskAcknowledgeMaxIds` per request.
    @discardableResult
    func acknowledgeAiTaskReplies(replyIds: [String]) async throws -> Int {
        let response: AiTaskAcknowledgeResponse = try await post(
            "/api/ai-tasks/acknowledge", body: AiTaskAcknowledge(ids: nil, replyIds: replyIds)
        )
        return response.repliesAcknowledged ?? 0
    }

    nonisolated static let aiTaskAcknowledgeMaxIds = 100

    /// A request still running under the same key is waited for this many
    /// times, each wait capped at `aiTaskReplyInProgressMaxWait` seconds.
    nonisolated static let aiTaskReplyInProgressRetries = 2
    nonisolated static let aiTaskReplyInProgressMaxWait: TimeInterval = 10

    /// Replies to Claude about a task it processed on the server. A direct,
    /// online-only call that never goes through `SyncManager`: a reply asks
    /// Claude to act now, it is not an edit to replay later. Reuse
    /// `idempotencyKey` for a retry of the same reply.
    ///
    /// Throws `AiTaskReplyFailure` for every non-2xx answer and transport
    /// failure. Expected rejections leave a breadcrumb; anything else is
    /// reported here.
    func replyToAiTask(id: String, text: String, idempotencyKey: String) async throws -> AiTask {
        var request = URLRequest(url: try makeURL("/api/ai-tasks/\(id)/replies"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(AiTaskReplyCreate(text: text))
        applySyncHeaders(&request, idempotencyKey: idempotencyKey, clientEditedAt: nil)
        var waits = 0
        let maxWaits = Self.aiTaskReplyInProgressRetries
        while true {
            do {
                return try await sendAiTaskReply(request)
            } catch AiTaskReplyFailure.requestInProgress(let retryAfter) where waits < maxWaits {
                waits += 1
                try await Task.sleep(for: .seconds(min(retryAfter, Self.aiTaskReplyInProgressMaxWait)))
            }
        }
    }

    private func sendAiTaskReply(_ request: URLRequest) async throws -> AiTask {
        let path = request.url?.path ?? "/api/ai-tasks/replies"
        ErrorReporter.addBreadcrumb("POST \(path)", category: "http")
        let data: Data
        let response: HTTPURLResponse
        do {
            (data, response) = try await executeRequestData(request)
        } catch let error as APIError {
            let failure = AiTaskReplyFailure(transport: error)
            recordAiTaskReplyFailure(failure, error: error, request: request)
            throw failure
        }
        guard (200 ..< 300).contains(response.statusCode) else {
            let failure = AiTaskReplyFailure(
                status: response.statusCode,
                body: data,
                retryAfter: response.value(forHTTPHeaderField: "Retry-After")
            )
            let error = APIError.serverError(response.statusCode, String(data: data, encoding: .utf8))
            recordAiTaskReplyFailure(failure, error: error, request: request)
            throw failure
        }
        if response.value(forHTTPHeaderField: "x-idempotent-replay") == "true" {
            ErrorReporter.addBreadcrumb("AI task reply replayed", category: "ai-task")
        }
        do {
            return try JSONDecoder().decode(AiTaskResponse.self, from: data).task
        } catch {
            let decodingError = APIError.decodingError(
                error,
                statusCode: response.statusCode,
                body: String(data: data, encoding: .utf8)
            )
            ErrorReporter.capture(decodingError, context: Self.errorContext(for: request, error: decodingError))
            throw AiTaskReplyFailure.failed(status: response.statusCode)
        }
    }

    private func recordAiTaskReplyFailure(_ failure: AiTaskReplyFailure, error: APIError, request: URLRequest) {
        if failure.isExpected {
            ErrorReporter.addBreadcrumb(
                "AI task reply rejected",
                category: "ai-task",
                data: ["reason": failure.telemetryReason]
            )
        } else {
            var context = Self.errorContext(for: request, error: error)
            context["reason"] = failure.telemetryReason
            ErrorReporter.capture(error, context: context)
        }
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
