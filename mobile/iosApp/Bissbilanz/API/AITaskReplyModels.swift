import Foundation

/// Matches `AiTaskClaudeThread`: the conversation under a task Claude
/// processed on the server, plus whether the user can reply right now. Every
/// field the spec marks extensible stays a raw string here and is mapped
/// through the enums below, so a value a newer server adds never fails decoding.
struct AiTaskClaudeThread: Codable, Hashable {
    /// Oldest first; empty until the user replies.
    var messages: [AiTaskThreadMessage]
    /// An extensible string — map it through `AiTaskCorrectionState`.
    let correctionState: String
    let canReply: Bool
    /// An extensible string, null when `canReply` — map it through `AiTaskReplyBlockedReason`.
    let replyBlockedReason: String?
    let repliesRemaining: Int
    var unreadReplies: Int

    var correction: AiTaskCorrectionState {
        AiTaskCorrectionState(rawState: correctionState)
    }

    var blockedReason: AiTaskReplyBlockedReason? {
        replyBlockedReason.map { AiTaskReplyBlockedReason(code: $0) }
    }

    /// The reason the thread spells out. `not_completed` stays unsaid, as on
    /// the web: on a dismissed task with a conversation, "possible once
    /// completed" would promise something that is not going to happen.
    var shownBlockedReason: AiTaskReplyBlockedReason? {
        guard let reason = blockedReason, reason != .notCompleted else { return nil }
        return reason
    }

    var unreadAnswers: [AiTaskThreadMessage] {
        messages.filter(\.isUnreadAnswer)
    }

    /// The thread once the given answers are read, with the count to match.
    func markingRead(_ ids: Set<String>) -> AiTaskClaudeThread {
        var copy = self
        copy.messages = messages.map { message in
            guard ids.contains(message.id) else { return message }
            var read = message
            read.unread = false
            return read
        }
        copy.unreadReplies = copy.messages.filter(\.isUnreadAnswer).count
        return copy
    }
}

/// Matches `AiTaskThreadMessage`.
struct AiTaskThreadMessage: Codable, Hashable, Identifiable {
    let id: String
    /// An extensible string: `"user"` or `"assistant"`. Anything else reads as Claude.
    let role: String
    let text: String
    /// Null on the user's messages. An extensible string on Claude's — map it
    /// through `AiTaskReplyOutcome`.
    let outcome: String?
    let createdAt: String
    /// Only ever true on Claude's answers.
    var unread: Bool

    var isFromUser: Bool {
        role == "user"
    }

    var replyOutcome: AiTaskReplyOutcome {
        AiTaskReplyOutcome(rawOutcome: outcome)
    }

    var isUnreadAnswer: Bool {
        !isFromUser && unread
    }
}

/// What one of Claude's answers did to the meal.
enum AiTaskReplyOutcome: Equatable {
    /// The meal's entries or foods changed.
    case changed
    /// Claude answered without changing anything; also any outcome this build does not know.
    case answered
    /// The correction did not work; nothing changed.
    case failed

    init(rawOutcome: String?) {
        switch rawOutcome {
        case "changed"?: self = .changed
        case "failed"?: self = .failed
        default: self = .answered
        }
    }
}

/// Where the correction for the latest reply stands.
enum AiTaskCorrectionState: Equatable {
    case idle
    case queued
    case running
    case retrying
    case failed
    /// A state this build does not know; shown as in progress.
    case other

    init(rawState: String) {
        switch rawState {
        case "idle": self = .idle
        case "queued": self = .queued
        case "running": self = .running
        case "retrying": self = .retrying
        case "failed": self = .failed
        default: self = .other
        }
    }

    /// A correction may still change the task, so the thread shows it working.
    var isInFlight: Bool {
        switch self {
        case .idle, .failed: false
        case .queued, .running, .retrying, .other: true
        }
    }

    /// Worth polling the list for: only the states this build knows to end.
    /// An unknown one is refreshed on the next visit instead.
    var isPolled: Bool {
        switch self {
        case .queued, .running, .retrying: true
        case .idle, .failed, .other: false
        }
    }

    static func hasPolledWork(in tasks: [AiTask]) -> Bool {
        tasks.contains { $0.claudeThread?.correction.isPolled == true }
    }
}

/// Why a reply is not possible, from `replyBlockedReason` or a rejection's `code`.
enum AiTaskReplyBlockedReason: Equatable {
    case notProcessedByServer
    case notCompleted
    case correctionInFlight
    case replyLimitReached
    case failedTooOften
    case processorUnavailable
    case budgetExhausted
    case rateLimited
    /// A reason this build does not know; shown with a generic message.
    case other

    /// Nil for anything that is not a reason this build knows.
    init?(knownCode: String?) {
        switch knownCode {
        case "not_processed_by_server"?: self = .notProcessedByServer
        case "not_completed"?: self = .notCompleted
        case "correction_in_flight"?: self = .correctionInFlight
        case "reply_limit_reached"?: self = .replyLimitReached
        case "failed_too_often"?: self = .failedTooOften
        case "processor_unavailable"?: self = .processorUnavailable
        case "budget_exhausted"?: self = .budgetExhausted
        case "rate_limited"?: self = .rateLimited
        default: return nil
        }
    }

    init(code: String) {
        self = AiTaskReplyBlockedReason(knownCode: code) ?? .other
    }
}

/// Body of `POST /api/ai-tasks/{id}/replies`.
struct AiTaskReplyCreate: Codable {
    var text: String
}

/// Matches `AiTaskReplyErrorResponse`; the idempotency layer's `{ error }`
/// bodies (`idempotency_key_reused`, `request_in_progress`) decode into it too.
struct AiTaskReplyErrorBody: Decodable {
    let error: String
    let code: String?
}

/// How a reply failed to send. `BissbilanzAPI.replyToAiTask` classifies every
/// status itself, because the shared response decoding drops the body's `code`
/// and the `Retry-After` header.
enum AiTaskReplyFailure: Error, Equatable {
    /// Offline, timed out or the host was unreachable.
    case network
    case unauthorized
    case updateRequired
    case taskNotFound
    /// The server refused this reply for a reason it named.
    case blocked(AiTaskReplyBlockedReason, retryAfter: TimeInterval?)
    /// A 429 without a reply code: the generic API limiter.
    case tooManyRequests(retryAfter: TimeInterval)
    /// A request with the same key is still running server-side.
    case requestInProgress(retryAfter: TimeInterval)
    case keyReused
    case invalid
    /// A 403 or 409 whose code this build does not know, or that has none.
    case rejected(status: Int, code: String?)
    case failed(status: Int)

    init(status: Int, body: Data, retryAfter: String?) {
        let parsed = try? JSONDecoder().decode(AiTaskReplyErrorBody.self, from: body)
        self = Self.classify(status: status, code: parsed?.code, error: parsed?.error, retryAfter: retryAfter)
    }

    /// What `executeRequestData` throws: it only ever fails on the transport,
    /// a dead session or the version gate.
    init(transport error: APIError) {
        switch error {
        case .networkError: self = .network
        case .unauthorized: self = .unauthorized
        case .updateRequired: self = .updateRequired
        case .notFound, .gone, .badRequest, .conflict, .serverError, .decodingError: self = .failed(status: 0)
        }
    }

    static func classify(status: Int, code: String?, error: String?, retryAfter: String?) -> AiTaskReplyFailure {
        if status == 404 || code == "task_not_found" {
            return .taskNotFound
        }
        let delay = retryAfter.map { AiTaskRequestInProgress.retryDelay(header: $0) }
        if (400 ..< 500).contains(status), let reason = AiTaskReplyBlockedReason(knownCode: code) {
            return .blocked(reason, retryAfter: delay)
        }
        switch status {
        case 400:
            return .invalid
        case 422 where error == "idempotency_key_reused":
            return .keyReused
        case 429:
            return .tooManyRequests(retryAfter: delay ?? AiTaskRequestInProgress.retryDelay(header: nil))
        case 503 where error == "request_in_progress":
            return .requestInProgress(retryAfter: delay ?? AiTaskRequestInProgress.retryDelay(header: nil))
        case 403, 409:
            return .rejected(status: status, code: code)
        default:
            return .failed(status: status)
        }
    }

    /// A rejection the reply contract describes, or the device's own state:
    /// a breadcrumb, not a Sentry error.
    var isExpected: Bool {
        switch self {
        case .network, .unauthorized, .updateRequired, .taskNotFound, .blocked, .tooManyRequests,
             .requestInProgress:
            true
        case let .rejected(_, code):
            code != nil
        case .keyReused, .invalid, .failed:
            false
        }
    }

    /// The server's view of the thread has moved on (or the earlier attempt may
    /// have landed), so the list is re-read to show it.
    var refreshesList: Bool {
        switch self {
        case .taskNotFound, .blocked, .rejected, .requestInProgress:
            true
        case .network, .unauthorized, .updateRequired, .tooManyRequests, .keyReused, .invalid, .failed:
            false
        }
    }

    /// No 201 arrived, but the server may still have stored the reply: the
    /// response was lost, the first attempt is still running, or the server
    /// failed after accepting it. The list is re-read to find out.
    var mayHaveLanded: Bool {
        switch self {
        case .network, .requestInProgress:
            true
        case let .failed(status):
            status == 0 || status >= 500 || (200 ..< 300).contains(status)
        case .unauthorized, .updateRequired, .taskNotFound, .blocked, .tooManyRequests, .keyReused, .invalid,
             .rejected:
            false
        }
    }

    /// How long the server asked not to try again, when it said.
    var retryAfter: TimeInterval? {
        switch self {
        case let .tooManyRequests(delay):
            delay
        case let .blocked(_, delay):
            delay
        case .network, .unauthorized, .updateRequired, .taskNotFound, .requestInProgress, .keyReused, .invalid,
             .rejected, .failed:
            nil
        }
    }

    var telemetryReason: String {
        switch self {
        case .network: "network"
        case .unauthorized: "unauthorized"
        case .updateRequired: "update_required"
        case .taskNotFound: "task_not_found"
        case let .blocked(reason, _): "blocked_\(String(describing: reason))"
        case .tooManyRequests: "too_many_requests"
        case .requestInProgress: "request_in_progress"
        case .keyReused: "idempotency_key_reused"
        case .invalid: "invalid"
        case let .rejected(status, code): "rejected_\(status)_\(code ?? "none")"
        case let .failed(status): "failed_\(status)"
        }
    }
}

/// How `AiTaskStore.sendReply` ended, for the reply box.
enum AiTaskReplySendResult: Equatable {
    case sent
    case failed(AiTaskReplyFailure)
    /// Nothing was sent: the text was empty, a reply to this task is already
    /// on its way, or there is no server (Local mode).
    case skipped
}

/// What `BissbilanzAPI.replyToAiTask` got back. A replay is the server
/// answering a retry from the first attempt's stored 201, whose task is the
/// task as it was back then.
struct AiTaskReplyReceipt {
    let task: AiTask
    let isReplay: Bool
}

/// One reply's `Idempotency-Key`. Retrying the same text reuses it, so the
/// server answers from the first attempt instead of recording the reply twice;
/// a different text is a different reply and gets a new key.
struct AiTaskReplyAttempt: Equatable {
    let key: String
    let text: String
    /// The user's messages the thread held when this reply was first sent.
    var baseline: Set<String> = []

    static func next(
        for text: String,
        previous: AiTaskReplyAttempt?,
        baseline: Set<String> = [],
        makeKey: () -> String = { UUID().uuidString }
    ) -> AiTaskReplyAttempt {
        if let previous, previous.text == text {
            return previous
        }
        return AiTaskReplyAttempt(key: makeKey(), text: text, baseline: baseline)
    }

    /// The thread holds this reply: a user message the thread did not have
    /// when it was sent, with the same text. How a send whose answer was lost
    /// turns out to have landed after all.
    func landed(in thread: AiTaskClaudeThread?) -> Bool {
        let messages = thread?.messages ?? []
        return messages.contains { message in
            message.isFromUser && !baseline.contains(message.id) && AiTaskReplyDraft.trimmed(message.text) == text
        }
    }
}

/// What the reply box of one task holds. Kept by the store, keyed by task, so
/// switching tabs or leaving the screen does not lose it.
struct AiTaskReplyComposer: Equatable {
    var text = ""
    /// Why the last send failed, shown under the text it kept.
    var failure: AiTaskReplyFailure?
    /// Send stays off until then: the server answered with a `Retry-After`.
    var blockedUntil: Date?

    func isBlocked(at now: Date) -> Bool {
        guard let until = blockedUntil else { return false }
        return until > now
    }
}

/// The reply box's text rules, matching `aiTaskReplyCreateSchema`.
enum AiTaskReplyDraft {
    static let maxLength = 1000

    /// What the server stores: it trims before checking the length.
    static func trimmed(_ text: String) -> String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// The length as the server counts it — UTF-16 code units, like JavaScript.
    static func length(_ text: String) -> Int {
        text.utf16.count
    }

    /// Cuts the text at a character boundary so it fits the server's limit.
    static func clamped(_ text: String, limit: Int = AiTaskReplyDraft.maxLength) -> String {
        guard length(text) > limit else { return text }
        var result = ""
        var count = 0
        for character in text {
            let size = character.utf16.count
            guard count + size <= limit else { break }
            result.append(character)
            count += size
        }
        return result
    }
}

/// An answer that changed a meal, with the day whose entries it changed.
struct AiTaskChangedAnswer: Equatable {
    let messageId: String
    let date: String
}

/// Unread answers, diary changes and the first tab to show, worked out from the list.
enum AiTaskThreadChanges {
    /// Answers that changed a meal and have not re-pulled its day on this
    /// device yet: new since the previous read, or still unread. The unread
    /// rule covers the first read of a launch, which has nothing earlier to
    /// compare against — usually a background refresh that just started the app.
    static func changedAnswersToRefresh(
        previous: [AiTask],
        next: [AiTask],
        isFirstRead: Bool,
        alreadyRefreshed: Set<String>
    ) -> [AiTaskChangedAnswer] {
        let known = Set(messageIds(in: previous))
        var answers: [AiTaskChangedAnswer] = []
        for task in next {
            for message in task.claudeThread?.messages ?? [] {
                guard !message.isFromUser, message.replyOutcome == .changed,
                      !alreadyRefreshed.contains(message.id)
                else { continue }
                let isNew = !isFirstRead && !known.contains(message.id)
                if isNew || message.unread {
                    answers.append(AiTaskChangedAnswer(messageId: message.id, date: task.date))
                }
            }
        }
        return answers
    }

    static func messageIds(in tasks: [AiTask]) -> [String] {
        tasks.flatMap { task in
            (task.claudeThread?.messages ?? []).map(\.id)
        }
    }

    /// The ids kept from `ids` after the list was read: only those it still
    /// holds — unless it is empty, which is what a failed refresh looks like —
    /// and at most `cap`, newest last.
    static func pruned(_ ids: [String], knownIds: Set<String>, cap: Int) -> [String] {
        let kept = knownIds.isEmpty ? ids : ids.filter { knownIds.contains($0) }
        return Array(kept.suffix(cap))
    }

    /// Ids of every unread answer in `tasks`, in list order.
    static func unreadReplyIds(in tasks: [AiTask]) -> [String] {
        tasks.flatMap { task in
            (task.claudeThread?.unreadAnswers ?? []).map(\.id)
        }
    }

    /// Every task with the given answers marked read. Lets an answer this
    /// device already acknowledged stay read when a list read that started
    /// before the acknowledgement lands afterwards.
    static func maskingRead(_ tasks: [AiTask], read: Set<String>) -> [AiTask] {
        guard !read.isEmpty else { return tasks }
        return tasks.map { task in
            guard let thread = task.claudeThread,
                  thread.messages.contains(where: { $0.unread && read.contains($0.id) })
            else { return task }
            var copy = task
            copy.claudeThread = thread.markingRead(read)
            return copy
        }
    }

    /// The status tab holding what the user has to look at: an unread
    /// dismissal first, then an unread answer or a correction still running.
    static func statusWithNews(in tasks: [AiTask]) -> String? {
        if let dismissal = tasks.first(where: \.isUnreadDismissal) {
            return dismissal.status
        }
        let news = tasks.first { task in
            task.hasUnreadReplies || task.claudeThread?.correction.isInFlight == true
        }
        return news?.status
    }

    static func chunked(_ ids: [String], size: Int) -> [[String]] {
        stride(from: 0, to: ids.count, by: size).map { start in
            Array(ids[start ..< min(start + size, ids.count)])
        }
    }
}
