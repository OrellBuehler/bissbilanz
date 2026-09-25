import Foundation
import Observation
import SwiftData

/// Local-first repository for logging reminders (weight/meal/sleep). The
/// list endpoint returns the complete set, so `refresh()` replaces wholesale
/// — mirrors `SupplementRepository.refresh()`. Writes are SwiftData-first
/// with the upload queued via the sync manager, same pattern as
/// `WeightRepository`.
@MainActor
@Observable
final class ReminderRepository {
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

    func reminders() -> [Reminder] {
        let descriptor = FetchDescriptor<LocalReminder>(sortBy: [SortDescriptor(\.id)])
        let rows = (try? context.fetch(descriptor)) ?? []
        return rows.compactMap { $0.toReminder() }
    }

    // MARK: - Refresh (API → store)

    func refresh() async throws {
        guard !appMode.isLocal else { return }
        let fetched = try await api.getReminders()
        let serverIds = Set(fetched.map(\.id))
        // Rows with an un-uploaded queued write must survive the server
        // response — see WeightRepository.refresh for the full rationale.
        let pendingIds = syncManager.pendingAffectedIds(table: "reminders")
        for stale in reminders() where !serverIds.contains(stale.id) && !pendingIds.contains(stale.id) {
            deleteRow(id: stale.id)
        }
        for reminder in fetched where !pendingIds.contains(reminder.id) {
            LocalRemap.upsertReminder(reminder, in: context)
        }
        save()
    }

    // MARK: - Writes (local first + queued upload)

    @discardableResult
    func createReminder(_ create: ReminderCreate) async throws -> Reminder {
        let temp = makeReminder(from: create, id: LocalStore.makeTempId())
        LocalRemap.upsertReminder(temp, in: context)
        save()
        syncManager.enqueue(.createReminder(body: create, localId: temp.id))
        return temp
    }

    /// See `WeightRepository.updateEntry` — a missing local row is reported
    /// as a failure without also queueing an upload the caller was just told
    /// failed.
    @discardableResult
    func updateReminder(id: String, _ update: ReminderUpdate) async throws -> Reminder {
        guard let row = LocalRemap.reminderRow(id: id, in: context), let existing = row.toReminder() else {
            throw APIError.notFound
        }
        let patch = (try? JSONPatch.dictionary(of: update)) ?? [:]
        let updated = (try? JSONPatch.merged(Reminder.self, base: existing, patch: patch)) ?? existing
        row.update(from: updated)
        save()
        if LocalStore.isTempId(id) {
            coalesceQueuedCreate(tempId: id, update: update)
        } else {
            syncManager.enqueue(.updateReminder(id: id, body: update))
        }
        return updated
    }

    func deleteReminder(id: String) async throws {
        deleteRow(id: id)
        save()
        if LocalStore.isTempId(id) {
            syncManager.removeQueued(table: "reminders", affectedId: id)
        } else {
            syncManager.enqueue(.deleteReminder(id: id))
        }
    }

    /// Rewrites the still-queued create for a temp-id reminder so the
    /// eventual upload carries the edited values.
    private func coalesceQueuedCreate(tempId: String, update: ReminderUpdate) {
        for row in syncManager.queuedOperations(table: "reminders", affectedId: tempId) {
            guard let operation = row.operation(),
                  case let .createReminder(body, localId) = operation
            else { continue }
            let patch = (try? JSONPatch.dictionary(of: update)) ?? [:]
            let merged = (try? JSONPatch.merged(ReminderCreate.self, base: body, patch: patch)) ?? body
            syncManager.replace(row, with: .createReminder(body: merged, localId: localId))
        }
    }

    // MARK: - Conversion helpers

    private func makeReminder(from create: ReminderCreate, id: String) -> Reminder {
        Reminder(
            id: id,
            userId: "",
            kind: create.kind,
            mealType: create.kind == .meal ? create.mealType : nil,
            time: create.time,
            weekdays: create.weekdays ?? Array(0 ... 6),
            enabled: create.enabled ?? true,
            createdAt: DateFormatting.isoDateTimeString(from: Date()),
            updatedAt: nil
        )
    }

    // MARK: - Store helpers

    private func deleteRow(id: String) {
        if let row = LocalRemap.reminderRow(id: id, in: context) {
            context.delete(row)
        }
    }

    private func save() {
        try? context.save()
    }
}
