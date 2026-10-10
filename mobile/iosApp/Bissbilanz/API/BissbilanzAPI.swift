import Foundation
import Observation

struct AiTaskRequestInProgress: Error {
    let retryAfter: TimeInterval

    static func retryDelay(header: String?, now: Date = Date()) -> TimeInterval {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
        let seconds = header.flatMap(TimeInterval.init)
            ?? header.flatMap { formatter.date(from: $0)?.timeIntervalSince(now) }
            ?? 60
        return max(1, min(seconds.isFinite ? seconds : 60, 86400))
    }
}

enum APIError: Error, LocalizedError {
    case unauthorized
    case notFound
    /// HTTP 410 Gone — the resource existed and was permanently deleted.
    case gone
    case badRequest(String?)
    /// HTTP 409. `serverNewer` is true for `X-Sync-Conflict: server-newer` (LWW
    /// conflict); otherwise this is a validation/duplicate conflict, or — for a
    /// DELETE — the `has_entries` body a "checked" delete needs to read.
    case conflict(serverNewer: Bool, body: Data?)
    case serverError(Int, String?)
    case networkError(Error)
    /// The HTTP status and (truncated) body are carried alongside the underlying
    /// `DecodingError` so telemetry records the real response that failed to
    /// parse — an envelope/key/field mismatch otherwise surfaces as a bare
    /// decode error with no status or body.
    case decodingError(Error, statusCode: Int, body: String?)
    /// HTTP 426 — this build is older than `X-Client-Min-Version`. Thrown from
    /// `executeRequestData` for every request the moment it's detected, which
    /// is also where `UpdateRequiredGate` is flagged — so this case reaching a
    /// caller and the app-wide blocking screen appearing happen together.
    /// `SyncManager` pauses draining rather than treating it as a per-operation
    /// failure (see its `FailureKind.updateRequired`).
    case updateRequired(minVersion: String)

    var errorDescription: String? {
        switch self {
        case .unauthorized: "Not authenticated"
        case .notFound: "Not found"
        case .gone: "Gone"
        case let .badRequest(msg): msg ?? "Bad request"
        case .conflict: "Conflict"
        case let .serverError(code, msg): msg ?? "Server error (\(code))"
        case let .networkError(err): err.localizedDescription
        case let .decodingError(err, _, _): "Failed to parse response: \(err.localizedDescription)"
        case let .updateRequired(minVersion): "Update required (minimum version \(minVersion))"
        }
    }
}

/// Body of a food/recipe DELETE's `has_entries` 409 (`error` is dropped — the
/// counts are all a "checked" delete needs).
struct DeleteConflict: Decodable {
    let entryCount: Int
    let ingredientCount: Int?
    let recipeCount: Int?
    /// Foods only: supplements still use the food, which `force` cannot override.
    var supplementIngredientCount: Int?
    /// Foods only: recipes the food is the sole ingredient of. `force` cannot
    /// override this either — a recipe must keep at least one ingredient.
    var lastIngredientRecipes: [WhereUsedRef]?

    /// Forcing cannot delete this food, so the prompt must not offer it.
    var forceUnavailable: Bool {
        !(lastIngredientRecipes ?? []).isEmpty || (supplementIngredientCount ?? 0) > 0
    }

    /// Mirrors the web's ForceDeleteDialog copy — the message varies by which
    /// counts are actually present.
    var message: String {
        let recipeCount = recipeCount ?? 0
        if forceUnavailable {
            return L10n.deleteConflictSummary(
                entries: entryCount,
                recipes: recipeCount,
                supplements: supplementIngredientCount ?? 0
            )
        }
        if entryCount > 0, recipeCount > 0 {
            return L10n.deleteConflictEntriesAndRecipes(entries: entryCount, recipes: recipeCount)
        }
        if recipeCount > 0 {
            return L10n.deleteConflictRecipes(recipeCount)
        }
        return L10n.deleteConflictEntries(entryCount)
    }

    /// Why "Delete anyway" is not offered, when it is not.
    var forceUnavailableReason: String? {
        if let recipes = lastIngredientRecipes, !recipes.isEmpty {
            let names = recipes.map { "\"\($0.name)\"" }.joined(separator: ", ")
            return L10n.deleteConflictLastIngredient(recipes: names)
        }
        if let count = supplementIngredientCount, count > 0 {
            return L10n.deleteConflictSupplements(count)
        }
        return nil
    }
}

/// Result of a "checked" delete (see `RecipeRepository.deleteRecipeChecked`,
/// `FoodRepository.deleteFoodChecked`): the server (or, in Local mode, the local
/// cache) was asked first, so a conflict reaches the caller instead of being
/// silently dead-lettered by the sync queue.
enum DeleteOutcome {
    case deleted
    case blocked(DeleteConflict)
}

extension APIError {
    /// Parses `conflict(_:body:)`'s body as a delete conflict, falling back to
    /// zero counts if the body is missing or isn't shaped that way (a validation
    /// conflict has no counts at all) — the caller still knows *something* is
    /// blocking the delete.
    var deleteConflict: DeleteConflict? {
        guard case let .conflict(_, body) = self else { return nil }
        guard let body else { return DeleteConflict(entryCount: 0, ingredientCount: nil, recipeCount: nil) }
        return (try? JSONDecoder().decode(DeleteConflict.self, from: body))
            ?? DeleteConflict(entryCount: 0, ingredientCount: nil, recipeCount: nil)
    }
}

@MainActor
@Observable
final class BissbilanzAPI {
    let baseURL: String
    private let authManager: AuthManager
    private let session: URLSession
    private let decoder: JSONDecoder
    let encoder: JSONEncoder
    /// Shared with `AuthManager` — see `ClientVersionHeader`/`UpdateRequiredGate`.
    let updateGate: UpdateRequiredGate

    nonisolated static let defaultBaseURL = "https://bissbilanz.orellbuehler.ch"

    init(
        baseURL: String = BissbilanzAPI.defaultBaseURL,
        authManager: AuthManager,
        session: URLSession = .shared,
        updateGate: UpdateRequiredGate = UpdateRequiredGate()
    ) {
        self.baseURL = baseURL
        self.authManager = authManager
        self.session = session
        self.updateGate = updateGate
        decoder = JSONDecoder()
        encoder = JSONEncoder()
    }

    // MARK: - HTTP helpers

    /// Builds `baseURL + path` as a `URL`, throwing instead of the force-unwrap
    /// every call site used to repeat — `baseURL` comes from user-editable
    /// settings (a self-hosted deployment's own host), so a malformed value
    /// should surface as an error rather than crash the app.
    func makeURL(_ path: String) throws -> URL {
        guard let url = URL(string: "\(baseURL)\(path)") else {
            throw APIError.badRequest("Invalid URL: \(path)")
        }
        return url
    }

    func get<T: Decodable>(_ path: String, params: [String: String] = [:]) async throws -> T {
        var components = URLComponents(string: "\(baseURL)\(path)")!
        if !params.isEmpty {
            components.queryItems = params.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        var request = URLRequest(url: components.url!)
        request.httpMethod = "GET"
        // Never serve API reads from URLCache: these are per-user, frequently
        // mutated rows (an entry logged on web/MCP must show on the next pull),
        // and a stale 200 would silently hide fresh data with no error to debug.
        request.cachePolicy = .reloadIgnoringLocalCacheData
        return try await performRequest(request)
    }

    func post<T: Decodable>(
        _ path: String,
        body: some Encodable,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> T {
        var request = URLRequest(url: try makeURL(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)
        applySyncHeaders(&request, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)
        return try await performRequest(request)
    }

    func patch<T: Decodable>(
        _ path: String,
        body: some Encodable,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> T {
        var request = URLRequest(url: try makeURL(path))
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)
        applySyncHeaders(&request, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)
        return try await performRequest(request)
    }

    func put<T: Decodable>(
        _ path: String,
        body: some Encodable,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws -> T {
        var request = URLRequest(url: try makeURL(path))
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)
        applySyncHeaders(&request, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)
        return try await performRequest(request)
    }

    /// The server's manual CSRF check (`isOriginMismatch` in `hooks.server.ts`)
    /// blocks any `multipart/form-data` POST that arrives without an `Origin`
    /// header — browsers always send one, but `URLSession` doesn't, so it must
    /// be set explicitly here or every multipart upload 403s.
    func postMultipart<T: Decodable>(
        _ path: String,
        data: Data,
        fieldName: String,
        filename: String,
        mimeType: String = "image/jpeg",
        fields: [String: String] = [:]
    ) async throws -> T {
        try await postMultipart(
            path, fieldName: fieldName, parts: [(data: data, filename: filename)], mimeType: mimeType,
            fields: fields
        )
    }

    /// Repeats `fieldName` once per part, which is how the routes that accept
    /// several files read them. `fields` are plain text form fields sent
    /// alongside the file parts.
    func postMultipart<T: Decodable>(
        _ path: String,
        fieldName: String,
        parts: [(data: Data, filename: String)],
        mimeType: String = "image/jpeg",
        fields: [String: String] = [:]
    ) async throws -> T {
        var request = URLRequest(url: try makeURL(path))
        request.httpMethod = "POST"
        let boundary = "Boundary-\(UUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.setValue(baseURL, forHTTPHeaderField: "Origin")
        // Several photos over a weak cellular uplink outlast the default 60s.
        request.timeoutInterval = 120
        request.httpBody = Self.multipartBody(
            boundary: boundary, fieldName: fieldName, mimeType: mimeType, parts: parts, fields: fields
        )
        return try await performRequest(request)
    }

    /// `closing: false` leaves the body open so further parts can follow.
    static func multipartBody(
        boundary: String,
        fieldName: String,
        mimeType: String,
        parts: [(data: Data, filename: String)],
        fields: [String: String] = [:],
        closing: Bool = true
    ) -> Data {
        var body = Data()
        for (name, value) in fields.sorted(by: { $0.key < $1.key }) {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(value)\r\n".data(using: .utf8)!)
        }
        for part in parts {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append(
                "Content-Disposition: form-data; name=\"\(fieldName)\"; filename=\"\(part.filename)\"\r\n"
                    .data(using: .utf8)!
            )
            body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
            body.append(part.data)
            body.append("\r\n".data(using: .utf8)!)
        }
        if closing {
            body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        }
        return body
    }

    func getAccount() async throws -> AccountResponse {
        try await get("/api/account")
    }

    func deleteAccount() async throws {
        try await deleteRequest("/api/account")
    }

    /// Downloads the full-account ZIP archive. Returns the raw bytes — the
    /// response is a binary archive, not the JSON envelope `performRequest`
    /// expects.
    func exportAccountData() async throws -> Data {
        var request = URLRequest(url: try makeURL("/api/account/export"))
        // Full-account archive incl. photos — allow more than the default 60s
        request.timeoutInterval = 120
        ErrorReporter.addBreadcrumb("GET /api/account/export", category: "http")
        do {
            let (data, httpResponse) = try await executeRequestData(request)
            if httpResponse.statusCode >= 400 {
                throw APIError.serverError(httpResponse.statusCode, String(data: data, encoding: .utf8))
            }
            return data
        } catch {
            if error is AiTaskRequestInProgress { throw error }
            ErrorReporter.capture(error, context: Self.errorContext(for: request, error: error))
            throw error
        }
    }

    func deleteRequest(
        _ path: String,
        idempotencyKey: String? = nil,
        clientEditedAt: String? = nil
    ) async throws {
        var request = URLRequest(url: try makeURL(path))
        request.httpMethod = "DELETE"
        applySyncHeaders(&request, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)
        let _: EmptyResponse = try await performRequest(request)
    }

    func applySyncHeaders(
        _ request: inout URLRequest,
        idempotencyKey: String?,
        clientEditedAt: String?
    ) {
        if let key = idempotencyKey {
            request.setValue(key, forHTTPHeaderField: "Idempotency-Key")
        }
        if let editedAt = clientEditedAt {
            request.setValue(editedAt, forHTTPHeaderField: "X-Client-Edited-At")
        }
    }

    /// Single funnel for every API call: report failures to Sentry here so
    /// callers that recover (cache fallback, sync retries, `try?` lookups)
    /// don't silently swallow real defects. `ErrorReporter` filters expected
    /// noise (unauthorized, offline, not-found).
    ///
    /// Every request also drops a breadcrumb and, on failure, attaches the
    /// endpoint, method, status code and (truncated) response body — enough to
    /// debug a reported issue without reproducing it.
    func performRequest<T: Decodable>(_ request: URLRequest) async throws -> T {
        ErrorReporter.addBreadcrumb(
            "\(request.httpMethod ?? "?") \(request.url?.path ?? "?")",
            category: "http"
        )
        do {
            return try await executeRequest(request)
        } catch {
            if error is AiTaskRequestInProgress { throw error }
            ErrorReporter.capture(error, context: Self.errorContext(for: request, error: error))
            throw error
        }
    }

    /// Builds the structured context attached to a captured API error. Only the
    /// URL *path* is included — query strings can carry search terms (food
    /// names), and the response body is truncated to keep events small and
    /// avoid shipping large payloads.
    static func errorContext(for request: URLRequest, error: Error) -> [String: Any] {
        var context: [String: Any] = [:]
        if let method = request.httpMethod {
            context["method"] = method
        }
        if let path = request.url?.path {
            context["endpoint"] = path
        }
        switch error as? APIError {
        case let .serverError(code, message):
            context["status_code"] = code
            if let message {
                context["response_body"] = String(message.prefix(500))
            }
        case let .badRequest(message):
            context["status_code"] = 400
            if let message {
                context["response_body"] = String(message.prefix(500))
            }
        case let .decodingError(underlying, statusCode, body):
            context["status_code"] = statusCode
            context["decoding_error"] = String(describing: underlying)
            if let body {
                context["response_body"] = String(body.prefix(500))
            }
        case let .updateRequired(minVersion):
            context["status_code"] = 426
            context["min_version"] = minVersion
        case .networkError, .notFound, .gone, .conflict, .unauthorized, .none:
            break
        }
        return context
    }

    func executeRequest<T: Decodable>(_ request: URLRequest) async throws -> T {
        // Both the first attempt and the post-refresh 401 retry come back
        // through the same status classification + decode, so a 4xx/5xx/decode
        // failure on retry surfaces as the right APIError rather than a raw
        // DecodingError.
        let (data, httpResponse) = try await executeRequestData(request)
        return try decodeResponse(data, httpResponse)
    }

    func executeRequestData(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        // Refresh a token already past its `exp` before spending a request on
        // it. The 401 path below still exists for everything this can't know
        // (a revoked token, a clock skew, an unparseable JWT) — this just stops
        // the predictable case from costing a full round trip every time.
        if authManager.isAccessTokenExpired {
            _ = await authManager.refreshAccessToken()
        }
        var req = request
        ClientVersionHeader.apply(to: &req)
        let sentToken = authManager.accessToken
        if let sentToken {
            req.setValue("Bearer \(sentToken)", forHTTPHeaderField: "Authorization")
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw APIError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.networkError(URLError(.badServerResponse))
        }

        // Checked before the 401 handling below: an old build gets 426, never
        // 401, so this can never be confused with (or masked by) the
        // session-refresh path.
        try checkUpdateRequired(data, httpResponse)

        if httpResponse.statusCode == 401 {
            if await authManager.refreshAccessToken(rejecting: sentToken) {
                var retryReq = request
                ClientVersionHeader.apply(to: &retryReq)
                if let token = authManager.accessToken {
                    retryReq.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                }
                // Wrapped like the first attempt above — an unwrapped
                // `session.data` here let a raw URLError escape past the
                // APIError taxonomy, so every `catch let error as APIError`
                // missed it and ErrorReporter classified it down a different
                // branch than the identical failure on the first attempt.
                let retryData: Data
                let retryResponse: URLResponse
                do {
                    (retryData, retryResponse) = try await session.data(for: retryReq)
                } catch {
                    throw APIError.networkError(error)
                }
                guard let retryHTTP = retryResponse as? HTTPURLResponse else {
                    throw APIError.networkError(URLError(.badServerResponse))
                }
                try checkUpdateRequired(retryData, retryHTTP)
                if retryHTTP.statusCode == 401 {
                    throw APIError.unauthorized
                }
                return (retryData, retryHTTP)
            }
            // `unauthorized` means "session is dead, prompt to sign in" — a
            // transient refresh failure (offline, 429, 5xx, or a refresh still
            // cooling down after one) is just retryable.
            switch authManager.authState {
            case .expired, .unauthenticated:
                throw APIError.unauthorized
            case .authenticated, .refreshing:
                throw APIError.networkError(URLError(.cannotConnectToHost))
            }
        }

        return (data, httpResponse)
    }

    /// Flags `updateGate` and throws `.updateRequired` on a 426 — called at
    /// every point `executeRequestData` obtains a fresh `HTTPURLResponse`
    /// (first attempt and the post-401-refresh retry alike), so every caller
    /// of every request-building method above (`get`/`post`/`patch`/`put`/
    /// `deleteRequest`/`postMultipart`/`postPackage`/`downloadImage`/
    /// `exportAccountData`/`exportFoodPackage`/`lookupBarcode`) gets this for
    /// free without needing its own 426 handling.
    private func checkUpdateRequired(_ data: Data, _ httpResponse: HTTPURLResponse) throws {
        guard httpResponse.statusCode == 426 else { return }
        let minVersion = ClientVersionHeader.minVersion(from: httpResponse, data: data)
        updateGate.flag(minVersion: minVersion)
        throw APIError.updateRequired(minVersion: minVersion)
    }

    /// Classifies a response's status code into the right `APIError`
    /// (conflict / notFound / gone / badRequest / serverError) and otherwise
    /// decodes the body, wrapping decode failures as `.decodingError`. Shared by
    /// the first attempt and the post-refresh 401 retry so both paths handle
    /// errors identically.
    private func decodeResponse<T: Decodable>(_ data: Data, _ httpResponse: HTTPURLResponse) throws -> T {
        if httpResponse.statusCode == 503,
           let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           body["error"] as? String == "request_in_progress"
        {
            let header = httpResponse.value(forHTTPHeaderField: "Retry-After")
            throw AiTaskRequestInProgress(retryAfter: AiTaskRequestInProgress.retryDelay(header: header))
        }
        if httpResponse.statusCode == 409 {
            let conflictHeader = httpResponse.value(forHTTPHeaderField: "X-Sync-Conflict")
            throw APIError.conflict(serverNewer: conflictHeader == "server-newer", body: data)
        }
        if httpResponse.statusCode == 404 {
            throw APIError.notFound
        }
        if httpResponse.statusCode == 410 {
            throw APIError.gone
        }
        if httpResponse.statusCode == 400 {
            throw APIError.badRequest(String(data: data, encoding: .utf8))
        }
        if httpResponse.statusCode >= 400 {
            throw APIError.serverError(httpResponse.statusCode, String(data: data, encoding: .utf8))
        }
        // A 204 No Content (every DELETE) or any empty 2xx body carries nothing
        // to decode. `deleteRequest` asks for `EmptyResponse` here; returning the
        // sentinel avoids the dataCorrupted ("Unexpected end of file") error that
        // would otherwise dead-letter every queued delete after maxRetries. Real
        // typed responses still throw on an empty body — the `as? T` cast only
        // succeeds for the body-less EmptyResponse.
        if httpResponse.statusCode == 204 || data.isEmpty {
            if let empty = EmptyResponse() as? T {
                return empty
            }
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(
                error,
                statusCode: httpResponse.statusCode,
                body: String(data: data, encoding: .utf8)
            )
        }
    }
}

struct EmptyResponse: Decodable {}
