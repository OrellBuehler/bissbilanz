import Foundation
import Observation
import SwiftData

/// Local-first repository for user preferences (singleton row). Updates merge
/// the partial `PreferencesUpdate` onto the cached value locally and queue
/// the patch via the sync manager, mirroring the Android repository.
@MainActor
@Observable
final class PreferencesRepository {
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

    func preferences() -> Preferences? {
        fetchRow()?.toPreferences()
    }

    func refresh() async throws {
        guard !appMode.isLocal else { return }
        let prefs = try await api.getPreferences()
        upsert(prefs)
        save()
    }

    @discardableResult
    func update(_ update: PreferencesUpdate) async throws -> Preferences {
        let current = preferences() ?? .defaults
        let patch = (try? JSONPatch.dictionary(of: update)) ?? [:]
        let merged = (try? JSONPatch.merged(Preferences.self, base: current, patch: patch)) ?? current
        upsert(merged)
        save()
        syncManager.enqueue(.updatePreferences(body: update))
        return merged
    }

    // MARK: - Store helpers

    private func fetchRow() -> LocalPreferences? {
        let singletonId = LocalPreferences.singletonId
        var descriptor = FetchDescriptor<LocalPreferences>(predicate: #Predicate { $0.id == singletonId })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    private func upsert(_ preferences: Preferences) {
        if let row = fetchRow() {
            row.update(from: preferences)
        } else {
            context.insert(LocalPreferences(preferences: preferences))
        }
    }

    private func save() {
        try? context.save()
    }
}
