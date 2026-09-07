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

/// `GET /api/fasts` — finished fasts, newest first.
struct FastingSessionsResponse: Codable {
    let sessions: [FastingSessionRemote]
}

extension FastingSessionRemote {
    /// Maps the server row onto the local `FastingSession` shape, or nil for
    /// an unparseable id/timestamp (defensive — should never happen for a
    /// finished fast the server itself produced).
    var asFastingSession: FastingSession? {
        guard let uuid = UUID(uuidString: id),
              let started = DateFormatting.isoDateTime(from: startedAt),
              let ended = DateFormatting.isoDateTime(from: endedAt)
        else { return nil }
        return FastingSession(id: uuid, startedAt: started, targetHours: targetHours, endedAt: ended)
    }
}
