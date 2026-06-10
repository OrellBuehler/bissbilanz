import Foundation
import Observation
import SwiftData

/// Local-first repository for daily macro goals (singleton row). Writes are
/// SwiftData-first with the idempotent set-call queued via the sync manager.
@MainActor
@Observable
final class GoalsRepository {
    private let context: ModelContext
    private let api: BissbilanzAPI
    private let appMode: AppModeManager
    private let syncManager: SyncManager

    init(context: ModelContext, api: BissbilanzAPI, appMode: AppModeManager, syncManager: SyncManager) {
        self.context = context
        self.api = api
        self.appMode = appMode
        self.syncManager = syncManager
    }

    func goals() -> Goals? {
        fetchRow()?.toGoals()
    }

    func refresh() async throws {
        guard !appMode.isLocal else { return }
        guard let goals = try await api.getGoals() else { return }
        upsert(goals)
        save()
    }

    @discardableResult
    func setGoals(_ goals: Goals) async throws -> Goals {
        upsert(goals)
        save()
        syncManager.enqueue(.setGoals(body: goals))
        return goals
    }

    // MARK: - Store helpers

    private func fetchRow() -> LocalGoals? {
        let singletonId = LocalGoals.singletonId
        var descriptor = FetchDescriptor<LocalGoals>(predicate: #Predicate { $0.id == singletonId })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    private func upsert(_ goals: Goals) {
        if let row = fetchRow() {
            row.update(from: goals)
        } else {
            context.insert(LocalGoals(goals: goals))
        }
    }

    private func save() {
        try? context.save()
    }
}
