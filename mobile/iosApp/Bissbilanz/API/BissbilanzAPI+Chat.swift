import Foundation

/// A non-2xx answer to a chat request, with its `ChatErrorResponse` body when
/// it had one.
struct ChatRejection: Equatable, Sendable {
    let status: Int
    let body: ChatErrorResponse?
    /// Seconds from `Retry-After`, when the server sent one.
    let retryAfter: TimeInterval?

    var code: String? {
        body?.code
    }

    /// A rejection the contract describes (a coded refusal, a missing id, a
    /// rate limit) rather than a defect: recorded as a breadcrumb, not reported.
    var isExpected: Bool {
        if status >= 500 { return false }
        if status == 400 { return code != nil }
        return true
    }

    init(status: Int, body: ChatErrorResponse?, retryAfter: TimeInterval?) {
        self.status = status
        self.body = body
        self.retryAfter = retryAfter
    }

    init(status: Int, data: Data, retryAfterHeader: String?) {
        self.init(
            status: status,
            body: try? JSONDecoder().decode(ChatErrorResponse.self, from: data),
            retryAfter: retryAfterHeader.map { AiTaskRequestInProgress.retryDelay(header: $0) }
        )
    }
}

/// Why a chat request did not go through.
enum ChatFailure: Error {
    case rejected(ChatRejection)
    /// No answer to classify: offline, timed out, signed out, an update
    /// required, or a body that could not be read.
    case transport(APIError)

    var rejection: ChatRejection? {
        if case let .rejected(rejection) = self {
            return rejection
        }
        return nil
    }
}

extension BissbilanzAPI {
    /// The events stream pings every 20 seconds; 45 without a byte means the
    /// connection is gone (docs/ai-chat.md §5.1).
    nonisolated static let chatStreamIdleTimeout: TimeInterval = 45

    func listChatConversations(limit: Int = 100) async throws -> ChatConversationsResponse {
        var request = URLRequest(url: try chatURL("/api/chat/conversations", query: ["limit": "\(limit)"]))
        request.cachePolicy = .reloadIgnoringLocalCacheData
        return try await chatRequest(request)
    }

    /// Creating the same id again answers with the existing conversation.
    func createChatConversation(id: String, title: String? = nil) async throws -> ChatConversation {
        let response: ChatConversationResponse = try await chatRequest(
            jsonRequest("POST", "/api/chat/conversations", body: ChatConversationCreate(id: id, title: title))
        )
        return response.conversation
    }

    func getChatConversation(id: String) async throws -> ChatConversationDetailResponse {
        var request = URLRequest(url: try chatURL("/api/chat/conversations/\(id)"))
        request.cachePolicy = .reloadIgnoringLocalCacheData
        return try await chatRequest(request)
    }

    /// Nil clears the title.
    func renameChatConversation(id: String, title: String?) async throws -> ChatConversation {
        let response: ChatConversationResponse = try await chatRequest(
            jsonRequest("PATCH", "/api/chat/conversations/\(id)", body: ChatConversationUpdate(title: title))
        )
        return response.conversation
    }

    func deleteChatConversation(id: String) async throws {
        var request = URLRequest(url: try chatURL("/api/chat/conversations/\(id)"))
        request.httpMethod = "DELETE"
        let _: EmptyResponse = try await chatRequest(request)
    }

    /// Online only, never queued. The message id is the idempotency key, so a
    /// retry reuses it and no `Idempotency-Key` header is sent.
    func sendChatMessage(conversationId: String, _ message: ChatMessageCreate) async throws
        -> ChatMessageAcceptedResponse
    {
        try await chatRequest(
            jsonRequest("POST", "/api/chat/conversations/\(conversationId)/messages", body: message)
        )
    }

    /// One page of events after `after`, the JSON fallback to the stream.
    func chatEvents(conversationId: String, after: Int, limit: Int = 500) async throws -> ChatEventsResponse {
        var request = URLRequest(url: try chatURL(
            "/api/chat/conversations/\(conversationId)/events",
            query: ["after": "\(after)", "limit": "\(limit)"]
        ))
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.cachePolicy = .reloadIgnoringLocalCacheData
        return try await chatRequest(request)
    }

    func cancelChatRun(id: String) async throws -> ChatRun {
        var request = URLRequest(url: try chatURL("/api/chat/runs/\(id)/cancel"))
        request.httpMethod = "POST"
        let response: ChatRunResponse = try await chatRequest(request)
        return response.run
    }

    func decideChatAction(id: String, approve: Bool) async throws -> ChatActionDecisionResponse {
        try await chatRequest(
            jsonRequest("POST", "/api/chat/actions/\(id)", body: approve ? ChatActionDecision.approve : .reject)
        )
    }

    /// Follows the events after `after` as server-sent events until the server
    /// ends the stream or `onItem` returns false.
    func followChatEvents(
        conversationId: String,
        after: Int,
        onItem: @MainActor (ServerSentEventItem) async -> Bool
    ) async throws {
        var request = URLRequest(url: try chatURL(
            "/api/chat/conversations/\(conversationId)/events",
            query: ["after": "\(after)"]
        ))
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        if after > 0 {
            request.setValue("\(after)", forHTTPHeaderField: "Last-Event-ID")
        }
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = Self.chatStreamIdleTimeout
        do {
            try await followEventStream(request, onItem: onItem)
        } catch let rejected as ServerSentEventRejection {
            let rejection = ChatRejection(status: rejected.status, data: rejected.body, retryAfterHeader: rejected.retryAfter)
            recordChatRejection(rejection, request: request)
            throw ChatFailure.rejected(rejection)
        } catch let error as APIError {
            ErrorReporter.capture(error, context: Self.errorContext(for: request, error: error))
            throw ChatFailure.transport(error)
        }
    }

    // MARK: - Plumbing

    private func chatURL(_ path: String, query: [String: String] = [:]) throws -> URL {
        let url = try makeURL(path)
        guard !query.isEmpty else { return url }
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            throw APIError.badRequest("Invalid URL: \(path)")
        }
        components.queryItems = query.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
        guard let withQuery = components.url else {
            throw APIError.badRequest("Invalid URL: \(path)")
        }
        return withQuery
    }

    private func jsonRequest(_ method: String, _ path: String, body: some Encodable) throws -> URLRequest {
        var request = URLRequest(url: try chatURL(path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)
        return request
    }

    /// Every chat call goes through `executeRequestData` (token refresh, the
    /// version headers, the 426 gate, the 401 retry) and answers a non-2xx with
    /// a `ChatFailure` that keeps the body's code, capability, action and run.
    private func chatRequest<T: Decodable>(_ request: URLRequest) async throws -> T {
        ErrorReporter.addBreadcrumb(
            "\(request.httpMethod ?? "GET") \(request.url?.path ?? "/api/chat")",
            category: "http"
        )
        let data: Data
        let response: HTTPURLResponse
        do {
            (data, response) = try await executeRequestData(request)
        } catch let error as APIError {
            ErrorReporter.capture(error, context: Self.errorContext(for: request, error: error))
            throw ChatFailure.transport(error)
        }
        guard (200 ..< 300).contains(response.statusCode) else {
            let rejection = ChatRejection(
                status: response.statusCode,
                data: data,
                retryAfterHeader: response.value(forHTTPHeaderField: "Retry-After")
            )
            recordChatRejection(rejection, request: request)
            throw ChatFailure.rejected(rejection)
        }
        if response.statusCode == 204 || data.isEmpty, let empty = EmptyResponse() as? T {
            return empty
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            let decodingError = APIError.decodingError(
                error,
                statusCode: response.statusCode,
                body: String(data: data, encoding: .utf8)
            )
            ErrorReporter.capture(decodingError, context: Self.errorContext(for: request, error: decodingError))
            throw ChatFailure.transport(decodingError)
        }
    }

    private func recordChatRejection(_ rejection: ChatRejection, request: URLRequest) {
        if rejection.isExpected {
            ErrorReporter.addBreadcrumb(
                "Chat request rejected",
                category: "chat",
                data: [
                    "endpoint": request.url?.path ?? "?",
                    "status": rejection.status,
                    "code": rejection.code ?? "none"
                ]
            )
        } else {
            let error = APIError.serverError(rejection.status, rejection.body?.error)
            ErrorReporter.capture(error, context: Self.errorContext(for: request, error: error))
        }
    }
}
