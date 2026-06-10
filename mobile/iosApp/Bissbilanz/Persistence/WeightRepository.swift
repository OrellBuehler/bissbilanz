import Foundation
import Observation
import SwiftData

/// Local-first repository for weight entries. Reads come from SwiftData
/// (sorted by entry date, newest first); `refresh()` upserts the server list
/// by id and drops rows deleted elsewhere. Server-computed weight stats stay
/// on the direct API in the views.
@MainActor
@Observable
final class WeightRepository {
    private let context: ModelContext
    private let api: BissbilanzAPI

    init(context: ModelContext, api: BissbilanzAPI) {
        self.context = context
        self.api = api
    }

    // MARK: - Reads (local)

    func entries() -> [WeightEntry] {
        let descriptor = FetchDescriptor<LocalWeightEntry>(sortBy: [
            SortDescriptor(\.entryDate, order: .reverse),
        ])
        let rows = (try? context.fetch(descriptor)) ?? []
        return rows.compactMap { $0.toWeightEntry() }
    }

    func latest() -> WeightEntry? {
        var descriptor = FetchDescriptor<LocalWeightEntry>(sortBy: [
            SortDescriptor(\.entryDate, order: .reverse),
        ])
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first?.toWeightEntry()
    }

    // MARK: - Refresh (API → store)

    func refresh() async throws {
        let fetched = try await api.getWeightEntries()
        let serverIds = Set(fetched.map(\.id))
        for stale in entries() where !serverIds.contains(stale.id) && !LocalStore.isTempId(stale.id) {
            deleteRow(id: stale.id)
        }
        for entry in fetched {
            upsert(entry)
        }
        save()
    }

    // MARK: - Writes (local first, then API)

    @discardableResult
    func createEntry(_ create: WeightCreate) async throws -> WeightEntry {
        let temp = makeEntry(from: create, id: LocalStore.makeTempId())
        upsert(temp)
        save()
        let server = try await api.createWeightEntry(create)
        deleteRow(id: temp.id)
        upsert(server)
        save()
        return server
    }

    @discardableResult
    func updateEntry(id: String, _ update: WeightUpdate) async throws -> WeightEntry {
        var optimistic: WeightEntry?
        if let row = fetchRow(id: id), let existing = row.toWeightEntry() {
            let patch = (try? JSONPatch.dictionary(of: update)) ?? [:]
            let updated = (try? JSONPatch.merged(WeightEntry.self, base: existing, patch: patch)) ?? existing
            row.update(from: updated)
            save()
            optimistic = updated
        }
        if LocalStore.isTempId(id), let optimistic {
            return optimistic
        }
        let server = try await api.updateWeightEntry(id: id, update)
        upsert(server)
        save()
        return server
    }

    func deleteEntry(id: String) async throws {
        deleteRow(id: id)
        save()
        guard !LocalStore.isTempId(id) else { return }
        try await api.deleteWeightEntry(id: id)
    }

    // MARK: - Conversion helpers

    private func makeEntry(from create: WeightCreate, id: String) -> WeightEntry {
        let now = ISO8601DateFormatter().string(from: Date())
        return WeightEntry(
            id: id,
            userId: "",
            weightKg: create.weightKg,
            entryDate: create.entryDate,
            loggedAt: now,
            notes: create.notes,
            createdAt: now,
            updatedAt: nil
        )
    }

    // MARK: - Store helpers

    private func fetchRow(id: String) -> LocalWeightEntry? {
        var descriptor = FetchDescriptor<LocalWeightEntry>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    private func upsert(_ entry: WeightEntry) {
        if let row = fetchRow(id: entry.id) {
            row.update(from: entry)
        } else {
            context.insert(LocalWeightEntry(entry: entry))
        }
    }

    private func deleteRow(id: String) {
        if let row = fetchRow(id: id) {
            context.delete(row)
        }
    }

    private func save() {
        try? context.save()
    }
}
