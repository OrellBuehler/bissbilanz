import Foundation
import Observation
import SwiftData

/// Local-first repository for user preferences (singleton row). Updates merge
/// the partial `PreferencesUpdate` onto the cached value locally before the
/// API call, mirroring the Android repository.
@MainActor
@Observable
final class PreferencesRepository {
    private let context: ModelContext
    private let api: BissbilanzAPI

    init(context: ModelContext, api: BissbilanzAPI) {
        self.context = context
        self.api = api
    }

    func preferences() -> Preferences? {
        fetchRow()?.toPreferences()
    }

    func refresh() async throws {
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
        let server = try await api.updatePreferences(update)
        upsert(server)
        save()
        return server
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
