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
    private let defaults: UserDefaults

    /// Whether the server would run Claude for this user, from the last GET
    /// (PATCH responses omit it). Persisted so it survives a relaunch while
    /// offline; nil means unknown, which every caller treats as unavailable.
    private(set) var claudeCapability: ClaudeCapability?

    nonisolated static let claudeCapabilityKey = "claudeCapability"

    init(
        context: ModelContext,
        api: BissbilanzAPI,
        appMode: AppModeManager,
        syncManager: SyncManager,
        defaults: UserDefaults = .standard
    ) {
        self.context = context
        self.api = api
        self.appMode = appMode
        self.syncManager = syncManager
        self.defaults = defaults
        claudeCapability = Self.decodeCapability(defaults.data(forKey: Self.claudeCapabilityKey))
    }

    nonisolated static func encodeCapability(_ capability: ClaudeCapability?) -> Data? {
        guard let capability else { return nil }
        return try? JSONEncoder().encode(capability)
    }

    nonisolated static func decodeCapability(_ data: Data?) -> ClaudeCapability? {
        guard let data else { return nil }
        return try? JSONDecoder().decode(ClaudeCapability.self, from: data)
    }

    private func storeCapability(_ capability: ClaudeCapability?) {
        claudeCapability = capability
        if let data = Self.encodeCapability(capability) {
            defaults.set(data, forKey: Self.claudeCapabilityKey)
        } else {
            defaults.removeObject(forKey: Self.claudeCapabilityKey)
        }
    }

    func preferences() -> Preferences? {
        fetchRow()?.toPreferences()
    }

    func refresh() async throws {
        guard !appMode.isLocal else { return }
        let response = try await api.getPreferencesResponse()
        let prefs = response.preferences
        storeCapability(response.claude)
        // Singleton row — a queued updatePreferences carries no affectedId, so
        // presence is the only guard available (see GoalsRepository.refresh).
        guard !syncManager.hasPending(table: "preferences") else { return }
        upsert(prefs)
        save()
    }

    /// Reports the device's IANA timezone to the server so server-side analytics/MCP
    /// bucket days/hours in the user's local tz. Only updates when it differs from the
    /// stored value (loop guard); compares against the authoritative server value.
    func reportTimeZone(_ deviceTimeZone: String) async throws {
        guard !appMode.isLocal else { return }
        let current = try await api.getPreferences()
        guard current.timeZone != deviceTimeZone else { return }
        _ = try await update(PreferencesUpdate(timeZone: deviceTimeZone))
    }

    @discardableResult
    func update(_ update: PreferencesUpdate) async throws -> Preferences {
        let current = preferences() ?? .defaults
        var patch = (try? JSONPatch.dictionary(of: update)) ?? [:]
        // The server fans the legacy toggle out to the three split ones; do the
        // same for the local copy so an older caller still takes effect.
        if let legacy = patch["showDayPropertiesWidget"],
           patch["showWaterWidget"] == nil, patch["showActivityWidget"] == nil, patch["showNotesWidget"] == nil {
            patch["showWaterWidget"] = legacy
            patch["showActivityWidget"] = legacy
            patch["showNotesWidget"] = legacy
        }
        var merged = (try? JSONPatch.merged(Preferences.self, base: current, patch: patch)) ?? current
        if let processor = update.aiTaskProcessor {
            merged.aiTaskProcessorKind = processor
            merged.aiTaskProcessor = Preferences.legacyAiTaskProcessor(forKind: processor)
        }
        merged.showDayPropertiesWidget = merged.showWaterWidget || merged.showActivityWidget || merged.showNotesWidget
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
        context.saveReportingFailure("PreferencesRepository.save")
        // A preferences change can affect the widget snapshot directly (e.g.
        // `activityGoalAdjustment`/`activityCreditPercent` change the goal a
        // ring is drawn against), so refresh it like the other repositories do.
        WidgetSnapshotWriter.scheduleUpdate(context: context)
    }
}
