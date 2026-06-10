import Foundation
import Observation
import SwiftData

/// Local-first repository for supplements and taken-logs.
///
/// The supplement list and per-day logged ids come from SwiftData. The due
/// checklist is server-computed (schedule logic lives there); a local
/// approximation (active supplements + logged state) renders instantly and
/// `refreshChecklist` returns the authoritative server result while caching
/// the taken-logs for the day.
@MainActor
@Observable
final class SupplementRepository {
    private let context: ModelContext
    private let api: BissbilanzAPI

    init(context: ModelContext, api: BissbilanzAPI) {
        self.context = context
        self.api = api
    }

    // MARK: - Reads (local)

    func supplements() -> [Supplement] {
        let descriptor = FetchDescriptor<LocalSupplement>(sortBy: [SortDescriptor(\.sortOrder)])
        let rows = (try? context.fetch(descriptor)) ?? []
        return rows.compactMap { $0.toSupplement() }
    }

    func loggedSupplementIds(date: String) -> Set<String> {
        let descriptor = FetchDescriptor<LocalSupplementLog>(predicate: #Predicate { $0.date == date })
        let rows = (try? context.fetch(descriptor)) ?? []
        return Set(rows.map(\.supplementId))
    }

    /// Local approximation of the server checklist: all active supplements
    /// with taken state from the cached logs (no schedule filtering).
    func localChecklist(date: String) -> [SupplementChecklist] {
        let logs = fetchLogs(date: date)
        let takenAtById = Dictionary(uniqueKeysWithValues: logs.map { ($0.supplementId, $0.takenAt) })
        return supplements().filter(\.isActive).map { supplement in
            SupplementChecklist(
                supplement: supplement,
                taken: takenAtById[supplement.id] != nil,
                takenAt: takenAtById[supplement.id]
            )
        }
    }

    // MARK: - Refresh (API → store)

    func refresh() async throws {
        let fetched = try await api.getSupplements()
        // The list endpoint returns the complete set — replace wholesale
        // (mirrors Android's getAllSupplements), keeping optimistic temp rows.
        let serverIds = Set(fetched.map(\.id))
        for stale in supplements() where !serverIds.contains(stale.id) && !LocalStore.isTempId(stale.id) {
            deleteRow(id: stale.id)
        }
        for supplement in fetched {
            upsert(supplement)
        }
        save()
    }

    @discardableResult
    func refreshChecklist(date: String) async throws -> [SupplementChecklist] {
        let checklist = try await api.getSupplementChecklist(date: date)
        try? context.delete(model: LocalSupplementLog.self, where: #Predicate { $0.date == date })
        for item in checklist where item.taken {
            context.insert(LocalSupplementLog(
                supplementId: item.supplement.id,
                date: date,
                takenAt: item.takenAt ?? ISO8601DateFormatter().string(from: Date())
            ))
        }
        save()
        return checklist
    }

    /// History is server-computed; the cached logs answer when offline.
    func history(startDate: String, endDate: String) async -> [SupplementHistoryItem] {
        do {
            return try await api.getSupplementHistory(startDate: startDate, endDate: endDate)
        } catch {
            return localHistory(startDate: startDate, endDate: endDate)
        }
    }

    func localHistory(startDate: String, endDate: String) -> [SupplementHistoryItem] {
        let descriptor = FetchDescriptor<LocalSupplementLog>(
            predicate: #Predicate { $0.date >= startDate && $0.date <= endDate },
            sortBy: [SortDescriptor(\.date, order: .reverse)]
        )
        let logs = (try? context.fetch(descriptor)) ?? []
        let namesById = Dictionary(uniqueKeysWithValues: supplements().map { ($0.id, $0.name) })
        return logs.map { log in
            SupplementHistoryItem(
                supplementId: log.supplementId,
                supplementName: namesById[log.supplementId] ?? "",
                date: log.date,
                takenAt: log.takenAt
            )
        }
    }

    // MARK: - Writes (local first, then API)

    func logSupplement(id: String, date: String) async throws {
        upsertLog(SupplementLog(
            supplementId: id,
            date: date,
            takenAt: ISO8601DateFormatter().string(from: Date()),
            entryIds: []
        ))
        save()
        guard !LocalStore.isTempId(id) else { return }
        let log = try await api.logSupplement(id: id, date: date)
        upsertLog(log)
        save()
    }

    func unlogSupplement(id: String, date: String) async throws {
        deleteLog(supplementId: id, date: date)
        save()
        guard !LocalStore.isTempId(id) else { return }
        try await api.unlogSupplement(id: id, date: date)
    }

    @discardableResult
    func createSupplement(_ create: SupplementCreate) async throws -> Supplement {
        let temp = makeSupplement(from: create, id: LocalStore.makeTempId())
        upsert(temp)
        save()
        let server = try await api.createSupplement(create)
        deleteRow(id: temp.id)
        upsert(server)
        save()
        return server
    }

    @discardableResult
    func updateSupplement(id: String, _ update: SupplementUpdate) async throws -> Supplement {
        var optimistic: Supplement?
        if let row = fetchRow(id: id), let existing = row.toSupplement() {
            // Scalar fields only — update ingredients are inputs, not the
            // full resolved shape; the server response replaces them below.
            var patch = (try? JSONPatch.dictionary(of: update)) ?? [:]
            patch.removeValue(forKey: "ingredients")
            let updated = (try? JSONPatch.merged(Supplement.self, base: existing, patch: patch)) ?? existing
            row.update(from: updated)
            save()
            optimistic = updated
        }
        if LocalStore.isTempId(id), let optimistic {
            return optimistic
        }
        let server = try await api.updateSupplement(id: id, update)
        upsert(server)
        save()
        return server
    }

    func deleteSupplement(id: String) async throws {
        deleteRow(id: id)
        save()
        guard !LocalStore.isTempId(id) else { return }
        try await api.deleteSupplement(id: id)
    }

    // MARK: - Conversion helpers

    private func makeSupplement(from create: SupplementCreate, id: String) -> Supplement {
        Supplement(
            id: id,
            userId: "",
            name: create.name,
            scheduleType: create.scheduleType,
            scheduleDays: create.scheduleDays,
            scheduleStartDate: create.scheduleStartDate,
            isActive: create.isActive ?? true,
            sortOrder: create.sortOrder ?? 0,
            timeOfDay: create.timeOfDay,
            createdAt: ISO8601DateFormatter().string(from: Date()),
            updatedAt: nil,
            ingredients: []
        )
    }

    // MARK: - Store helpers

    private func fetchRow(id: String) -> LocalSupplement? {
        var descriptor = FetchDescriptor<LocalSupplement>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    private func upsert(_ supplement: Supplement) {
        if let row = fetchRow(id: supplement.id) {
            row.update(from: supplement)
        } else {
            context.insert(LocalSupplement(supplement: supplement))
        }
    }

    private func deleteRow(id: String) {
        if let row = fetchRow(id: id) {
            context.delete(row)
        }
        // Logs for a removed supplement are orphaned — drop them too.
        try? context.delete(model: LocalSupplementLog.self, where: #Predicate { $0.supplementId == id })
    }

    private func fetchLogs(date: String) -> [LocalSupplementLog] {
        let descriptor = FetchDescriptor<LocalSupplementLog>(predicate: #Predicate { $0.date == date })
        return (try? context.fetch(descriptor)) ?? []
    }

    private func upsertLog(_ log: SupplementLog) {
        let key = LocalSupplementLog.key(supplementId: log.supplementId, date: log.date)
        var descriptor = FetchDescriptor<LocalSupplementLog>(predicate: #Predicate { $0.id == key })
        descriptor.fetchLimit = 1
        if let row = (try? context.fetch(descriptor))?.first {
            row.update(from: log)
        } else {
            context.insert(LocalSupplementLog(log: log))
        }
    }

    private func deleteLog(supplementId: String, date: String) {
        let key = LocalSupplementLog.key(supplementId: supplementId, date: date)
        try? context.delete(model: LocalSupplementLog.self, where: #Predicate { $0.id == key })
    }

    private func save() {
        try? context.save()
    }
}
