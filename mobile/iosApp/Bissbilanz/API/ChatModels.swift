import Foundation

// The assistant chat (`/api/chat`, docs/ai-chat.md). Every enum-like field the
// spec marks extensible (`type`, `status`, `reason`, `role`, `domain`, `code`,
// `blockedReason`) stays a plain string, so a value a newer server adds never
// fails decoding; the helpers below map the values this build knows.

/// What one domain of the diary the assistant changed. Neither `dates` nor
/// `ids` means anything in the domain may have changed.
struct ChatChange: Codable, Equatable, Hashable, Sendable {
    let domain: String
    var dates: [String]?
    var ids: [String]?
}

struct ChatRun: Codable, Equatable, Sendable, Identifiable {
    let id: String
    var conversationId: String?
    var userMessageId: String?
    var assistantMessageId: String?
    var status: String
    var reason: String?
    var changed: [String]?
    var changes: [ChatChange]?
    var createdAt: String?
    var startedAt: String?
    var finishedAt: String?

    var isActive: Bool {
        ChatRunStatus.isActive(status)
    }
}

enum ChatRunStatus {
    static let queued = "queued"
    static let running = "running"
    static let awaitingConfirmation = "awaiting_confirmation"

    /// Unknown values count as final, as the contract asks.
    static func isActive(_ status: String) -> Bool {
        switch status {
        case queued, running, awaitingConfirmation: true
        default: false
        }
    }
}

struct ChatActionPreview: Codable, Equatable, Sendable {
    var summary: String
    var details: [String]
}

struct ChatAction: Codable, Equatable, Sendable, Identifiable {
    let id: String
    var conversationId: String?
    var runId: String?
    var messageId: String?
    var toolUseId: String?
    var name: String?
    var label: String?
    var status: String
    var preview: ChatActionPreview?
    var expiresAt: String?
    var decidedAt: String?
    var createdAt: String?
}

enum ChatActionStatus {
    static let pending = "pending"
    static let approved = "approved"
    static let rejected = "rejected"
    static let expired = "expired"
    static let cancelled = "cancelled"
}

/// One block of a message. Which fields are set depends on `type`: `text`
/// (Markdown), `image` (`url`), `tool` (an activity row) or `action` (a
/// confirmation card). Parts of an unknown type are skipped.
struct ChatMessagePart: Codable, Equatable, Sendable {
    var type: String
    var text: String?
    var url: String?
    var toolUseId: String?
    var name: String?
    var label: String?
    var status: String?
    var summary: String?
    var changed: [String]?
    var changes: [ChatChange]?
    var actionId: String?
    var preview: ChatActionPreview?
    var expiresAt: String?

    static let textType = "text"
    static let imageType = "image"
    static let toolType = "tool"
    static let actionType = "action"
    /// Holds the place of a part whose events never arrived; rendered as
    /// nothing, like any unknown type.
    static let placeholderType = "placeholder"
}

struct ChatMessage: Codable, Equatable, Sendable, Identifiable {
    let id: String
    var conversationId: String?
    var role: String
    var status: String
    var reason: String?
    var runId: String?
    var parts: [ChatMessagePart]
    var createdAt: String?
    var updatedAt: String?

    /// Anything but `user` renders like the assistant.
    var isFromUser: Bool {
        role == "user"
    }

    var isInProgress: Bool {
        status == "in_progress"
    }
}

struct ChatConversation: Codable, Equatable, Sendable, Identifiable {
    let id: String
    var title: String?
    var createdAt: String?
    var updatedAt: String?
    var lastMessageAt: String?
    var lastSeq: Int
}

struct ChatConversationListItem: Codable, Equatable, Sendable, Identifiable {
    let id: String
    var title: String?
    var createdAt: String?
    var updatedAt: String?
    var lastMessageAt: String?
    var lastSeq: Int
    var activeRun: ChatRun?
}

struct ChatConversationsResponse: Codable, Equatable, Sendable {
    let conversations: [ChatConversationListItem]
    let total: Int
}

struct ChatConversationResponse: Codable, Equatable, Sendable {
    let conversation: ChatConversation
}

struct ChatConversationDetailResponse: Codable, Equatable, Sendable {
    let conversation: ChatConversation
    /// Oldest first; the assistant message of an active run already holds
    /// every event up to `lastSeq`.
    let messages: [ChatMessage]
    let pendingActions: [ChatAction]
    let activeRun: ChatRun?
    let lastSeq: Int
    let capability: ChatCapability?
}

struct ChatMessageAcceptedResponse: Codable, Equatable, Sendable {
    let message: ChatMessage
    let run: ChatRun
    /// The seq of this message's `message_created` event.
    let seq: Int
}

struct ChatEventsResponse: Codable, Equatable, Sendable {
    let events: [ChatEvent]
    let nextAfter: Int
    let lastSeq: Int
    let hasMore: Bool
    let activeRun: ChatRun?
}

struct ChatRunResponse: Codable, Equatable, Sendable {
    let run: ChatRun
}

struct ChatActionDecisionResponse: Codable, Equatable, Sendable {
    let action: ChatAction
    let run: ChatRun
}

/// The body of every rejected chat request. `capability`, `action` and `run`
/// come with the codes that describe them.
struct ChatErrorResponse: Codable, Equatable, Sendable {
    let error: String
    var code: String?
    var capability: ChatCapability?
    var action: ChatAction?
    var run: ChatRun?
}

/// One event of a conversation. Fields depend on `type`; events of a type this
/// build does not know are skipped, but their seq still counts.
struct ChatEvent: Codable, Equatable, Sendable {
    let seq: Int
    let type: String
    var createdAt: String?
    var runId: String?
    var messageId: String?
    var partIndex: Int?
    var text: String?
    var toolUseId: String?
    var name: String?
    var label: String?
    var status: String?
    var summary: String?
    var changed: [String]?
    var changes: [ChatChange]?
    var reason: String?
    var actionId: String?
    var action: ChatAction?
    var message: ChatMessage?
    var run: ChatRun?
    var capability: ChatCapability?
    var code: String?
    var error: String?
}

// MARK: - Requests

struct ChatConversationCreate: Codable, Equatable, Sendable {
    var id: String?
    var title: String?
}

/// `title` always travels, as an explicit null to clear it.
struct ChatConversationUpdate: Encodable, Equatable, Sendable {
    var title: String?

    private enum CodingKeys: String, CodingKey {
        case title
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(title, forKey: .title)
    }
}

struct ChatMessageContext: Codable, Equatable, Sendable {
    var date: String?
    var timezone: String?
    var locale: String?
}

struct ChatMessageCreate: Codable, Equatable, Sendable {
    let id: String
    let text: String
    var imageFilenames: [String]?
    var context: ChatMessageContext?
}

struct ChatActionDecision: Codable, Equatable, Sendable {
    let decision: String

    static let approve = ChatActionDecision(decision: "approve")
    static let reject = ChatActionDecision(decision: "reject")
}

/// The limits the server enforces (docs/ai-chat.md §11), checked before a send
/// so the composer can say so instead of a 400.
enum ChatLimits {
    static let maxTextLength = 4000
    static let maxPhotosPerMessage = 5
    static let maxPhotosPerConversation = 20
    static let maxTitleLength = 120

    /// Length as the server counts it: UTF-16 code units.
    static func length(_ text: String) -> Int {
        text.utf16.count
    }

    /// `text` cut to at most `limit` UTF-16 code units, never inside a character.
    static func clamped(_ text: String, maxUTF16 limit: Int) -> String {
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
