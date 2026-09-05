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
/// what changes.
struct AiTaskUpdate: Codable {
    var status: String?
    var resultSummary: String?
    var description: String?
    var date: String?
    var mealType: String?
    var eatenAt: String?
    var acknowledged: Bool?
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
