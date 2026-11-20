import Foundation

/// A friendly line for how a chat run ended or why a request did not go
/// through, mapped from the documented status, reason and error codes
/// (docs/ai-chat.md §4, §7, §8). Unknown codes fall back to the generic text
/// for their status, or to the server's own `error` message.
enum ChatNotice: Equatable, Sendable {
    case cutOff
    case iterationLimit
    case incomplete
    case unavailable
    case noAccess
    case budgetExhausted
    case refusal
    case conversationTooLong
    case failed
    case stopped
    case actionExpired
    case actionNotPending
    case interrupted
    case dailyLimit(retryAfter: TimeInterval?)
    case rateLimited
    case runActive
    case invalidImage
    case conversationMissing
    case offline
    case signedOut
    case server(String)

    /// "Start a new chat" is the way forward.
    var offersNewChat: Bool {
        self == .conversationTooLong
    }

    var message: String {
        L10n.chatNotice(self)
    }

    /// The hint under an assistant message: nil for a plain completion and
    /// for a run the user replaced with a new message.
    static func forMessage(status: String, reason: String?) -> ChatNotice? {
        switch status {
        case "in_progress":
            nil
        case "completed":
            completed(reason: reason)
        case "cancelled":
            cancelled(reason: reason)
        case "interrupted":
            .interrupted
        default:
            failed(reason: reason)
        }
    }

    private static func completed(reason: String?) -> ChatNotice? {
        switch reason {
        case nil: nil
        case "output_limit"?: .cutOff
        case "iteration_limit"?: .iterationLimit
        default: .incomplete
        }
    }

    private static func cancelled(reason: String?) -> ChatNotice? {
        switch reason {
        case "superseded"?: nil
        case "action_expired"?: .actionExpired
        default: .stopped
        }
    }

    private static func failed(reason: String?) -> ChatNotice {
        switch reason {
        case "not_configured"?, "disabled"?, "no_access"?: .unavailable
        case "user_budget_exhausted"?, "global_budget_exhausted"?: .budgetExhausted
        case "refusal"?: .refusal
        case "conversation_too_long"?: .conversationTooLong
        default: .failed
        }
    }

    /// Why the composer is off, from a capability that says unavailable.
    static func forCapability(_ capability: ChatCapability) -> ChatNotice? {
        guard !capability.available else { return nil }
        switch capability.blockedReason {
        case "user_budget_exhausted"?, "global_budget_exhausted"?: return .budgetExhausted
        case "no_access"?: return .noAccess
        default: return .unavailable
        }
    }

    /// A send, decision, cancel or read that did not go through.
    static func forFailure(_ error: Error) -> ChatNotice {
        switch error {
        case let failure as ChatFailure:
            switch failure {
            case let .rejected(rejection):
                return forRejection(rejection)
            case let .transport(apiError):
                return forTransport(apiError)
            }
        case let apiError as APIError:
            return forTransport(apiError)
        case is URLError:
            return .offline
        default:
            return .failed
        }
    }

    static func forRejection(_ rejection: ChatRejection) -> ChatNotice {
        if let code = rejection.code, let notice = forCode(code, retryAfter: rejection.retryAfter) {
            return notice
        }
        switch rejection.status {
        case 403:
            return .unavailable
        case 404:
            return .conversationMissing
        case 429:
            return .rateLimited
        default:
            if let message = rejection.body?.error, rejection.code != nil, !message.isEmpty {
                return .server(message)
            }
            return .failed
        }
    }

    private static func forCode(_ code: String, retryAfter: TimeInterval?) -> ChatNotice? {
        switch code {
        case "budget_exhausted": .budgetExhausted
        case "chat_unavailable": .unavailable
        case "conversation_too_long": .conversationTooLong
        case "daily_limit_reached": .dailyLimit(retryAfter: retryAfter)
        case "run_active": .runActive
        case "invalid_image": .invalidImage
        case "conversation_not_found", "run_not_found": .conversationMissing
        case "action_not_found", "action_not_pending": .actionNotPending
        case "action_expired": .actionExpired
        case "message_id_conflict", "conversation_exists", "run_not_active": .failed
        default: nil
        }
    }

    private static func forTransport(_ error: APIError) -> ChatNotice {
        switch error {
        case .unauthorized: .signedOut
        case .networkError: .offline
        case .notFound, .gone: .conversationMissing
        default: .failed
        }
    }
}
