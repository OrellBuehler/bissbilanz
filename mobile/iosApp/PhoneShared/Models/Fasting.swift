import Foundation

/// Server copy of a completed fast (`/api/fasts`). Only finished fasts are
/// uploaded — the running one stays in `FastingSessionStore`.
struct FastingSessionUpsert: Codable, Equatable {
    var id: String?
    var startedAt: String
    var endedAt: String
    var targetHours: Int
}

struct FastingSessionRemote: Codable {
    let id: String
    let userId: String
    let startedAt: String
    let endedAt: String
    let targetHours: Int
    let createdAt: String?
    let updatedAt: String?
}

struct FastingSessionResponse: Codable {
    let session: FastingSessionRemote
}
