import Foundation
import Observation

/// AI tasks, held in memory rather than in SwiftData.
///
/// Deliberately not the local-first pattern the other repositories use: a task is only
/// ever resolved by the MCP assistant server-side, so a local mirror could never be
/// authoritative and there is nothing to queue — the web client made the same call and
/// skips its Dexie mirror. In Local mode the queue does not exist at all.
@MainActor
@Observable
final class AiTaskStore {
    private let api: BissbilanzAPI
    private let appMode: AppModeManager

    private(set) var tasks: [AiTask] = []

    init(api: BissbilanzAPI, appMode: AppModeManager) {
        self.api = api
        self.appMode = appMode
    }

    var unreadDismissals: [AiTask] {
        tasks.filter(\.isUnreadDismissal)
    }

    func refresh() async throws {
        guard !appMode.isLocal else { return }
        tasks = try await api.listAiTasks(limit: 100).tasks
    }

    /// Clears the unread badge for every resolved task. Called when the user opens the
    /// list — posting a notification does not count as reading it, which is what lets
    /// each of the user's devices announce the same dismissal once.
    func acknowledgeAll() async {
        guard !appMode.isLocal, !unreadDismissals.isEmpty else { return }
        do {
            try await api.acknowledgeAiTasks()
            try await refresh()
        } catch {
            // Leave the badge up rather than pretending it was read.
            ErrorReporter.capture(error, context: ["op": "acknowledgeAiTasks"])
        }
    }

    func delete(id: String) async throws {
        guard !appMode.isLocal else { return }
        try await api.deleteAiTask(id: id)
        tasks.removeAll { $0.id == id }
    }
}
