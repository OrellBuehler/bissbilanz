import Foundation
import Observation
import SwiftData

/// Local-first repository for supplements and taken-logs.
///
/// The supplement list and per-day logged ids come from SwiftData. The due
/// checklist is server-computed (schedule logic lives there); a local
/// approximation (active supplements + logged state) renders instantly and
/// `refreshChecklist` returns the authoritative server result while caching
/// the taken-logs for the day. Writes are SwiftData-first with the upload
/// queued via the sync manager; deleting a still-queued temp supplement also
/// removes its queued logs (they share the affected table/id).
@MainActor
@Observable
final class SupplementRepository {
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
        // LocalSupplementLog has no unique constraint (CloudKit can't enforce one), so
        // duplicates are expected between a mirrored delivery and the next LocalDedup.sweep.
        // Earliest tick wins: takenAt is an ISO-8601 UTC string, so min() is chronological
        // and independent of fetch order.
        let takenAtById = Dictionary(
            logs.map { ($0.supplementId, $0.takenAt) },
            uniquingKeysWith: { Swift.min($0, $1) }
        )
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
        guard !appMode.isLocal else { return }
        let fetched = try await api.getSupplements()
        // The list endpoint returns the complete set — replace wholesale
        // (mirrors Android's getAllSupplements), keeping optimistic temp rows.
        let serverIds = Set(fetched.map(\.id))
        // Rows with an un-uploaded queued write must survive the server
        // response: a refresh racing the sync-queue upload would otherwise
        // reapply the stale server copy over the user's edit (see
        // EntryRepository.refresh, PR #416).
        let pendingIds = syncManager.pendingAffectedIds(table: "supplements")
        for stale in supplements() where !serverIds.contains(stale.id)
            && !LocalStore.isTempId(stale.id) && !pendingIds.contains(stale.id)
        {
            deleteRow(id: stale.id)
        }
        for supplement in fetched where !pendingIds.contains(supplement.id) {
            upsert(supplement)
        }
        save()
    }

    @discardableResult
    func refreshChecklist(date: String) async throws -> [SupplementChecklist] {
        guard !appMode.isLocal else { return localChecklist(date: date) }
        let checklist = try await api.getSupplementChecklist(date: date)
        // A tick made offline is still in the queue, so the server response
        // doesn't know about it yet. Rebuilding the day wholesale would clear
        // the checkmark until the drain and a later refresh put it back — keep
        // the queued rows and let their direction win over the server's.
        let pending = syncManager.pendingSupplementLogs(date: date)
        for row in fetchLogs(date: date) where !pending.logged.contains(row.supplementId) {
            context.delete(row)
        }
        let takenAtById = Dictionary(
            fetchLogs(date: date).map { ($0.supplementId, $0.takenAt) },
            uniquingKeysWith: { Swift.min($0, $1) }
        )
        for item in checklist where item.taken
            && !pending.unlogged.contains(item.supplement.id)
            && !pending.logged.contains(item.supplement.id)
        {
            context.insert(LocalSupplementLog(
                supplementId: item.supplement.id,
                date: date,
                takenAt: item.takenAt ?? DateFormatting.isoDateTimeString(from: Date())
            ))
        }
        save()
        return checklist.map { item -> SupplementChecklist in
            if pending.logged.contains(item.supplement.id) {
                return SupplementChecklist(
                    supplement: item.supplement,
                    taken: true,
                    takenAt: item.takenAt ?? takenAtById[item.supplement.id]
                )
            }
            if pending.unlogged.contains(item.supplement.id) {
                return SupplementChecklist(supplement: item.supplement, taken: false, takenAt: nil)
            }
            return item
        }
    }

    /// History is server-computed; the cached logs answer offline and in Local mode.
    func history(startDate: String, endDate: String) async -> [SupplementHistoryItem] {
        guard !appMode.isLocal else { return localHistory(startDate: startDate, endDate: endDate) }
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
        let namesById = Dictionary(
            supplements().map { ($0.id, $0.name) },
            uniquingKeysWith: { first, _ in first }
        )
        return logs.map { log in
            SupplementHistoryItem(
                supplementId: log.supplementId,
                supplementName: namesById[log.supplementId] ?? "",
                date: log.date,
                takenAt: log.takenAt
            )
        }
    }

    // MARK: - Writes (local first + queued upload)

    func logSupplement(id: String, date: String) async throws {
        upsertLog(SupplementLog(
            supplementId: id,
            date: date,
            takenAt: DateFormatting.isoDateTimeString(from: Date()),
            entryIds: []
        ))
        save()
        syncManager.enqueue(.logSupplement(supplementId: id, date: date))
        // iOS runs no code before a local notification is delivered, so a reminder for
        // something already taken has to be cancelled here. Every log path — the
        // checklist, the dashboard card, the notification's own Mark taken — funnels
        // through this method, so this one hook covers all of them. Cancel for the
        // *logged* day: marking yesterday's reminder as taken at 00:30 must not eat
        // today's still-pending reminders.
        await SupplementReminderScheduler.cancelToday(
            supplementId: id, on: DateFormatting.date(from: date) ?? Date()
        )
    }

    func unlogSupplement(id: String, date: String) async throws {
        deleteLog(supplementId: id, date: date)
        deleteCachedSupplementEntries(supplementId: id, date: date)
        save()
        if LocalStore.isTempId(id) {
            // The supplement isn't on the server — cancel the queued log instead.
            for row in syncManager.queuedOperations(table: "supplements", affectedId: id) {
                guard let operation = row.operation(),
                      case let .logSupplement(_, queuedDate) = operation, queuedDate == date
                else { continue }
                syncManager.remove(row)
            }
        } else {
            syncManager.enqueue(.unlogSupplement(supplementId: id, date: date))
        }
        // Un-ticking is usually an undo, so re-arm the rest of today's reminders.
        await SupplementReminderScheduler.refill(repository: self)
    }

    @discardableResult
    func createSupplement(_ create: SupplementCreate) async throws -> Supplement {
        let temp = makeSupplement(from: create, id: LocalStore.makeTempId())
        upsert(temp)
        save()
        syncManager.enqueue(.createSupplement(body: create, localId: temp.id))
        return temp
    }

    /// See `EntryRepository.updateEntry` — a missing local row is reported as a
    /// failure without also queueing an upload the caller was just told failed.
    @discardableResult
    func updateSupplement(id: String, _ update: SupplementUpdate) async throws -> Supplement {
        guard let row = fetchRow(id: id), let existing = row.toSupplement() else {
            throw APIError.notFound
        }
        var patch = (try? JSONPatch.dictionary(of: update)) ?? [:]
        patch.removeValue(forKey: "ingredients")
        var updated = (try? JSONPatch.merged(Supplement.self, base: existing, patch: patch)) ?? existing
        // Ingredient edits apply to the local row in BOTH modes (in Local
        // mode there is no server to reconcile from; in Synced mode the
        // refresh replaces this with the resolved server shape).
        if let inputs = update.ingredients {
            updated = Self.applying(
                ingredients: resolvedIngredients(inputs, supplementId: id),
                to: updated
            )
        }
        row.update(from: updated)
        save()
        if LocalStore.isTempId(id) {
            coalesceQueuedCreate(tempId: id, update: update)
        } else {
            syncManager.enqueue(.updateSupplement(id: id, body: update))
        }
        return updated
    }

    func deleteSupplement(id: String) async throws {
        deleteRow(id: id)
        save()
        if LocalStore.isTempId(id) {
            // Removes the queued create AND any queued logs for this
            // supplement — they share affectedTable/affectedId.
            syncManager.removeQueued(table: "supplements", affectedId: id)
        } else {
            syncManager.enqueue(.deleteSupplement(id: id))
        }
    }

    /// Rewrites the still-queued create for a temp-id supplement so the
    /// eventual upload carries the edited values.
    private func coalesceQueuedCreate(tempId: String, update: SupplementUpdate) {
        for row in syncManager.queuedOperations(table: "supplements", affectedId: tempId) {
            guard let operation = row.operation(),
                  case let .createSupplement(body, localId) = operation
            else { continue }
            let patch = (try? JSONPatch.dictionary(of: update)) ?? [:]
            let merged = (try? JSONPatch.merged(SupplementCreate.self, base: body, patch: patch)) ?? body
            syncManager.replace(row, with: .createSupplement(body: merged, localId: localId))
        }
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
            reminderTimes: create.reminderTimes,
            createdAt: DateFormatting.isoDateTimeString(from: Date()),
            updatedAt: nil,
            ingredients: resolvedIngredients(create.ingredients, supplementId: id)
        )
    }

    /// Materializes ingredient inputs for the local row: referenced foods are
    /// resolved from the local store, inline backing-food payloads (the
    /// supplement editor's shape, normally materialized server-side) become
    /// synthetic temp-id backing foods. Unresolvable inputs are dropped from
    /// the local row (the queued upload still carries them).
    private func resolvedIngredients(
        _ inputs: [SupplementIngredientInput],
        supplementId: String
    ) -> [SupplementIngredient] {
        inputs.enumerated().compactMap { index, input in
            let foodId: String
            let backing: SupplementBackingFood
            if let id = input.foodId, let food = LocalRemap.foodRow(id: id, in: context)?.toFood() {
                foodId = id
                backing = SupplementBackingFood(
                    id: food.id,
                    name: food.name,
                    brand: food.brand,
                    kind: .food,
                    servingSize: food.servingSize,
                    servingUnit: food.servingUnit.rawValue,
                    calories: food.calories,
                    protein: food.protein,
                    carbs: food.carbs,
                    fat: food.fat,
                    fiber: food.fiber,
                    ingredientsText: food.ingredientsText
                )
            } else if let inline = input.food {
                foodId = input.foodId ?? LocalStore.makeTempId()
                backing = SupplementBackingFood(
                    id: foodId,
                    name: inline.name,
                    brand: nil,
                    kind: .supplement,
                    servingSize: inline.servingSize,
                    servingUnit: inline.servingUnit,
                    calories: inline.calories,
                    protein: inline.protein,
                    carbs: inline.carbs,
                    fat: inline.fat,
                    fiber: inline.fiber,
                    ingredientsText: inline.ingredientsText
                )
            } else {
                return nil
            }
            return SupplementIngredient(
                id: LocalStore.makeTempId(),
                supplementId: supplementId,
                foodId: foodId,
                servings: input.servings ?? 1,
                sortOrder: input.sortOrder ?? index,
                food: backing
            )
        }
    }

    /// Copy of `supplement` with `ingredients` swapped in.
    private static func applying(ingredients: [SupplementIngredient], to supplement: Supplement) -> Supplement {
        Supplement(
            id: supplement.id,
            userId: supplement.userId,
            name: supplement.name,
            scheduleType: supplement.scheduleType,
            scheduleDays: supplement.scheduleDays,
            scheduleStartDate: supplement.scheduleStartDate,
            isActive: supplement.isActive,
            sortOrder: supplement.sortOrder,
            timeOfDay: supplement.timeOfDay,
            reminderTimes: supplement.reminderTimes,
            createdAt: supplement.createdAt,
            updatedAt: supplement.updatedAt,
            ingredients: ingredients
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

    /// Drops the ingredient entries the server created for this log. They only
    /// exist locally after an account downgrade downloaded them; without this the
    /// day keeps counting a supplement the user just un-ticked, and in Local mode
    /// nothing would ever clean them up.
    private func deleteCachedSupplementEntries(supplementId: String, date: String) {
        let descriptor = FetchDescriptor<LocalEntry>(predicate: #Predicate { $0.date == date })
        for row in (try? context.fetch(descriptor)) ?? [] where row.toEntry()?.supplementId == supplementId {
            context.delete(row)
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
