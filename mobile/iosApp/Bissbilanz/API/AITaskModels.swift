import Foundation

/// Matches `aiTaskSchema` in the server's `validation/responses/ai-tasks.ts`
/// exactly: `status`/`date` are always present, everything else the server can
/// store as SQL NULL is optional here too.
struct AiTask: Codable, Identifiable, Hashable {
    let id: String
    let userId: String
    let status: String
    let description: String?
    /// Mirrors `photoUrls.first`, kept by the server for older builds.
    let photoUrl: String?
    let photoUrls: [String]
    let date: String
    let mealType: String?
    /// When the meal was eaten. Null on a back-dated task queued without a
    /// time, where the assistant picks one.
    let eatenAt: String?
    let source: String?
    let resultSummary: String?
    let createdEntryIds: [String]?
    let completedAt: String?
    let dismissedAt: String?
    /// Null means the user has not seen how this task ended. Only dismissals the
    /// assistant made over MCP arrive unacknowledged — one the user tapped
    /// themselves is already stamped by the server.
    let acknowledgedAt: String?
    let createdAt: String?
    let updatedAt: String?

    var isUnreadDismissal: Bool {
        status == "dismissed" && acknowledgedAt == nil
    }
}

/// Matches `aiTaskUpdateSchema`. Every field is optional — a PATCH carries only
/// what changes. `description`, `mealType` and `eatenAt` are double optionals so
/// clearing one reaches the server as an explicit JSON null instead of being
/// silently dropped by `JSONEncoder` — see `EntryUpdate`.
struct AiTaskUpdate: Codable {
    var status: String?
    var resultSummary: String?
    var description: String??
    var photoUrls: [String]?
    var date: String?
    var mealType: String??
    var eatenAt: String??
    var acknowledged: Bool?
}

/// Declared in an extension so the memberwise initializer survives.
extension AiTaskUpdate {
    private enum CodingKeys: String, CodingKey {
        case status, resultSummary, description, photoUrls, date, mealType, eatenAt, acknowledged
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        status = try container.decodeIfPresent(String.self, forKey: .status)
        resultSummary = try container.decodeIfPresent(String.self, forKey: .resultSummary)
        photoUrls = try container.decodeIfPresent([String].self, forKey: .photoUrls)
        date = try container.decodeIfPresent(String.self, forKey: .date)
        acknowledged = try container.decodeIfPresent(Bool.self, forKey: .acknowledged)
        description = try container.decodeNullable(String.self, forKey: .description)
        mealType = try container.decodeNullable(String.self, forKey: .mealType)
        eatenAt = try container.decodeNullable(String.self, forKey: .eatenAt)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(status, forKey: .status)
        try container.encodeIfPresent(resultSummary, forKey: .resultSummary)
        try container.encodeIfPresent(photoUrls, forKey: .photoUrls)
        try container.encodeIfPresent(date, forKey: .date)
        try container.encodeIfPresent(acknowledged, forKey: .acknowledged)
        try container.encodeNullable(description, forKey: .description)
        try container.encodeNullable(mealType, forKey: .mealType)
        try container.encodeNullable(eatenAt, forKey: .eatenAt)
    }
}

struct AiTaskAcknowledge: Codable {
    var ids: [String]?
}

struct AiTaskAcknowledgeResponse: Codable {
    let acknowledged: Int
}

/// Matches `aiTaskCreateSchema`: `description`/`photoUrls` are individually
/// optional but the server rejects a payload with neither set.
struct AiTaskCreate: Codable {
    var description: String?
    var photoUrls: [String]?
    let date: String
    var mealType: String?
    var eatenAt: String?
    var source: String?
}

struct AiTaskResponse: Codable {
    let task: AiTask
}

struct AiTasksResponse: Codable {
    let tasks: [AiTask]
    let total: Int
}

struct AiTaskPhotoResponse: Codable {
    let photoUrl: String
    let photoUrls: [String]
}

/// Matches `mcpStatusResponseSchema`: whether the signed-in user has at least
/// one MCP client (e.g. Claude.ai, Claude Code) authorized against their
/// account — see `McpConnectionStatus`.
struct McpStatusResponse: Codable {
    let connected: Bool
}
