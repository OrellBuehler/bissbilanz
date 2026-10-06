import Foundation
import Observation
import SwiftData

/// Persistent offline write queue + drainer, mirroring the Android
/// `SyncQueue`/`SyncManager` pair on the main actor.
///
/// Repositories enqueue writes in Synced mode (in Local mode `enqueue` is a
/// no-op — the local store is the primary store and the login migrator uploads
/// it wholesale). The queue drains FIFO whenever something is enqueued,
/// connectivity is regained, or the app foregrounds. Per-operation outcomes:
/// - success → row removed; for creates the local `temp_` row is replaced with
///   the server record (shared `LocalRemap` helpers, same code the migrator uses).
/// - HTTP 409 + `X-Sync-Conflict: server-newer` → LWW lost; row removed, a
///   conflict notice is surfaced via `conflictNotices`, refresh triggered.
///   Exception: `completeAiTask` forces itself through unconditionally on this
///   response instead — see `execute` — since the entries it logged already
///   exist and dropping it would leave the task pending forever.
/// - HTTP 409 without header → real validation conflict; parked (see below).
/// - HTTP 404/410 on DELETE → idempotent; treat as success, remove silently.
/// - HTTP 404/410 on a create (create_entry/create_recipe/create_supplement) →
///   the create has no row of its own to have been deleted; a referenced
///   foodId/recipeId no longer exists. Still-`temp_` references are caught
///   before the request even goes out (see `unresolvedReference`) and either
///   kept queued (the peer create is still pending) or, when no create is
///   queued any more, recovered rather than parked — see
///   `recoverUnresolvedReference`: re-queue the create from the local row,
///   else log an entry as a quick entry from its snapshot, and only park as
///   "never created" when neither is possible; a resolved-but-now-missing reference is parked as
///   "no longer exists" with a conflict notice, distinct from below.
/// - HTTP 404/410 on other (non-create, non-delete) ops → record deleted
///   elsewhere; remove + conflict notice.
/// - 401 → `performRequest` already refreshed and retried once, so a final 401
///   means the session is dead: draining stops, the queue is kept.
/// - 5xx / 408 / 425 / 429 / network errors → retryCount increments, capped
///   exponential backoff via `nextAttemptAt`, retried indefinitely — a deploy
///   restart or a long outage must never cost the user an offline-logged change.
/// - Any other 4xx (400, 422, header-less 409, …) → *parked*: `failedAt` and
///   `failureReason` are set, the row stays in the store out of the drain, and
///   the pending-changes screen offers retry / discard. Rows are only ever
///   deleted by the user (discard) — never silently by the drain.
/// - 426 → this build is older than the server's minimum version
///   (`UpdateRequiredGate` is already flagged by `BissbilanzAPI` by the time
///   this is seen); draining stops, the row and its retryCount are untouched —
///   never retried, parked, or counted as a failed attempt — so it
///   uploads unchanged once the app is updated.
@MainActor
@Observable
final class SyncManager {
    private let context: ModelContext
    private let api: BissbilanzAPI
    private let appMode: AppModeManager
    private let connectivity: ConnectivityMonitor

    private(set) var isSyncing = false
    private(set) var pendingCount = 0
    /// Rows the server permanently rejected, kept for the user to retry or discard.
    private(set) var failedCount = 0
    private(set) var errors: [String] = []
    /// Conflict notices for the banner, capped — a device that was offline for
    /// a while can lose many writes, and `errors` is reset per drain while
    /// these are only cleared by an explicit dismissal. The banner renders the
    /// first notice plus a count, so the ones past the cap cost nothing but
    /// memory; `conflictNoticeCount` keeps that count honest.
    private(set) var conflictNotices: [String] = []
    /// Total conflicts recorded since the last dismissal, including any past
    /// the `conflictNotices` cap.
    private(set) var conflictNoticeCount = 0

    private static let maxConflictNotices = 50
    private(set) var lastSyncedAt: Date?

    @ObservationIgnored private var isDraining = false
    /// A pending delayed re-drain scheduled for when the soonest backoff expires.
    @ObservationIgnored private var retryTask: Task<Void, Never>?

    /// Invoked once per drain that resolved at least one conflict, so the app can
    /// pull the affected entities back down. Without it the row that *lost* keeps
    /// showing its superseded value until some unrelated refresh overwrites it.
    /// Set by the app once its repositories exist.
    ///
    /// Carries the days the conflicted operations touched. Refreshing only
    /// today left a conflict on a past day showing the superseded value — the
    /// one case this callback exists to prevent.
    @ObservationIgnored var onConflictResolved: ((Set<String>) async -> Void)?

    /// Invoked once per drain that dropped a `createEntry` for a foodId the
    /// server no longer has (see BISSBILANZ-33: the food was deleted, or
    /// merged into another food on web/MCP — `mergeFoods` re-points entries
    /// that already existed server-side, but not a still-queued offline
    /// create). Carries the affected foodIds so the app can re-fetch and, on a
    /// 404, prune each from the local mirror — otherwise the same stale food
    /// keeps surfacing in search/recents/favorites for the next offline log.
    @ObservationIgnored var onFoodReferenceMissing: ((Set<String>) async -> Void)?

    /// Set by the app: whether a food id is an imported food whose bulk upload has not
    /// happened yet (`BulkUploadManager.isAwaitingUpload`). The server would answer "not
    /// found" to an operation that refers to such a food, so the drain holds it back for a
    /// while instead — and the question moves that food to the front of the upload.
    @ObservationIgnored var isAwaitingBulkUpload: ((String) -> Bool)?

    /// How long an operation waits for a food to reach the server before the drain looks again.
    private static let bulkUploadWait: TimeInterval = 20

    /// Test seam: when false, `scheduleDrain` becomes a no-op so tests
    /// control drain timing explicitly via `drainPendingQueue`.
    @ObservationIgnored var autoDrain = true

    /// Client errors that are transient (timeout, too early, rate limited): retried, never parked.
    private static let transientClientStatuses: Set<Int> = [408, 425, 429]
    private static let backoffBase: TimeInterval = 2.0
    private static let backoffCap: TimeInterval = 5 * 60.0
    private static let backoffJitter: TimeInterval = 0.5

    init(
        context: ModelContext,
        api: BissbilanzAPI,
        appMode: AppModeManager,
        connectivity: ConnectivityMonitor
    ) {
        self.context = context
        self.api = api
        self.appMode = appMode
        self.connectivity = connectivity
        refreshCounts()
        connectivity.onOnlineChange = { [weak self] online in
            if online {
                self?.scheduleDrain()
            }
        }
    }

    // MARK: - Queue

    /// Persists an operation for upload. In Local mode the local store is the
    /// primary store, so nothing is queued — the login migrator uploads the
    /// store state when switching to Synced; queued ops would double-apply.
    func enqueue(_ operation: SyncOperation) {
        guard !appMode.isLocal else { return }
        captureEntrySnapshot(for: operation)
        insertOperation(operation)
        save()
        refreshCounts()
        scheduleDrain()
    }

    /// Affected ids that still have an un-uploaded queued write for `table`. A
    /// refresh uses this to avoid overwriting optimistic local rows with stale
    /// server state while their edit is still waiting in the queue. Parked rows
    /// don't count: they are out of the drain until the user acts, and holding
    /// refreshes back for them would freeze the row or table indefinitely.
    func pendingAffectedIds(table: String) -> Set<String> {
        let descriptor = FetchDescriptor<PendingSyncOperation>(
            predicate: #Predicate { $0.affectedTable == table && $0.failedAt == nil }
        )
        return Set(((try? context.fetch(descriptor)) ?? []).compactMap(\.affectedId))
    }

    /// Whether any un-uploaded write is queued for `table`. The singleton
    /// tables ("goals", "preferences") carry a nil `affectedId`, so
    /// `pendingAffectedIds` can't speak for them — their refresh guards on
    /// presence instead. Parked rows don't count (see `pendingAffectedIds`).
    func hasPending(table: String) -> Bool {
        let descriptor = FetchDescriptor<PendingSyncOperation>(
            predicate: #Predicate { $0.affectedTable == table && $0.failedAt == nil }
        )
        return ((try? context.fetchCount(descriptor)) ?? 0) > 0
    }

    /// Supplement ids with a queued tick/untick for `date`, in FIFO order so a
    /// later op wins. `refreshChecklist` rebuilds the day's logs from the server
    /// response, which would otherwise clear a tick made offline until the queue
    /// drains — `pendingAffectedIds` can't answer this because the date lives in
    /// the operation body, not on the row.
    func pendingSupplementLogs(date: String) -> (logged: Set<String>, unlogged: Set<String>) {
        let table = "supplements"
        let descriptor = FetchDescriptor<PendingSyncOperation>(
            predicate: #Predicate { $0.affectedTable == table },
            sortBy: [SortDescriptor(\.seq)]
        )
        var logged: Set<String> = []
        var unlogged: Set<String> = []
        for row in (try? context.fetch(descriptor)) ?? [] {
            guard let operation = row.operation() else { continue }
            switch operation {
            case let .logSupplement(supplementId, opDate) where opDate == date:
                unlogged.remove(supplementId)
                logged.insert(supplementId)
            case let .unlogSupplement(supplementId, opDate) where opDate == date:
                logged.remove(supplementId)
                unlogged.insert(supplementId)
            default:
                continue
            }
        }
        return (logged, unlogged)
    }

    /// Queued rows touching (table, id) in FIFO order — the coalescing lookup.
    func queuedOperations(table: String, affectedId: String) -> [PendingSyncOperation] {
        let descriptor = FetchDescriptor<PendingSyncOperation>(
            predicate: #Predicate { $0.affectedTable == table && $0.affectedId == affectedId },
            sortBy: [SortDescriptor(\.seq)]
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    /// Rewrites a queued operation in place (temp-id coalescing).
    /// The idempotencyKey is NOT changed — coalescing never changes the logical operation.
    func replace(_ row: PendingSyncOperation, with operation: SyncOperation) {
        row.replaceOperation(operation)
        save()
    }

    func remove(_ row: PendingSyncOperation) {
        context.delete(row)
        save()
        refreshCounts()
    }

    /// Drops every queued operation touching (table, id) — used when a
    /// `temp_` row is deleted before its create drained (this also removes
    /// queued supplement-logs for a temp supplement, which share the table/id).
    ///
    /// Deleting a `temp_` food or recipe also drops the create other queued
    /// writes were waiting on; those are resolved first (entries become quick
    /// entries) instead of being left to park as "never created".
    func removeQueued(table: String, affectedId: String) {
        if table == "foods" || table == "recipes", LocalStore.isTempId(affectedId) {
            detachDependents(table: table, id: affectedId, excluding: nil)
        }
        for row in queuedOperations(table: table, affectedId: affectedId) {
            if let operation = row.operation() {
                forgetEntrySnapshot(operation)
            }
            context.delete(row)
        }
        save()
        refreshCounts()
    }

    /// Drops the conflict notices once the user has acknowledged them.
    func clearConflictNotices() {
        conflictNotices = []
        conflictNoticeCount = 0
    }

    private func noteConflict(_ notice: String) {
        conflictNoticeCount += 1
        guard conflictNotices.count < Self.maxConflictNotices else { return }
        conflictNotices.append(notice)
    }

    func clearQueue() {
        do {
            try context.delete(model: PendingSyncOperation.self)
        } catch {
            ErrorReporter.captureWarning("Clearing the sync queue failed", context: ["reason": ErrorReporter.reason(for: error)])
        }
        save()
        pendingCount = 0
        failedCount = 0
    }

    // MARK: - Draining

    /// Fire-and-forget drain trigger (enqueue, connectivity regained, app
    /// foreground). The drain itself is reentrancy-guarded.
    func scheduleDrain() {
        guard autoDrain else { return }
        Task {
            await drainPendingQueue()
        }
    }

    /// Uploads queued operations FIFO. Returns the number of operations
    /// removed from the queue (successes and permanent drops).
    @discardableResult
    func drainPendingQueue() async -> Int {
        guard !appMode.isLocal, !isDraining, connectivity.isOnline else { return 0 }
        isDraining = true
        isSyncing = true
        errors = []
        var processed = 0
        var sawConflict = false
        var conflictDates: Set<String> = []
        /// foodIds a dropped `createEntry` referenced that the server no longer
        /// has — collected so the caller can prune them from the local food
        /// mirror once, after the drain, rather than per-operation.
        var missingFoodIds: Set<String> = []
        ErrorReporter.addBreadcrumb("drain start", category: "sync", data: ["sync.pending": pendingCount])
        defer {
            isSyncing = false
            isDraining = false
            refreshCounts()
            if processed > 0 {
                lastSyncedAt = Date()
            }
            // Recover backed-off ops without waiting for an external trigger.
            scheduleRetryDrain()
        }

        // Re-fetch the head each iteration instead of iterating a start-of-
        // drain snapshot: operations enqueued while an upload is in flight
        // (their `scheduleDrain` is swallowed by the `isDraining` guard) are
        // picked up by this drain instead of waiting for the next trigger.
        // Every iteration removes the head row, backs it off, or returns, so the
        // loop terminates. Items whose `nextAttemptAt` is in the future are
        // skipped via `nextDueRow()` (backoff) — a backed-off op no longer
        // stalls the ops queued behind it. That skip only applies to failures
        // scoped to one operation; a server-scoped failure ends the drain, so an
        // outage cannot charge a retry to every queued op at once.
        drain: while let row = nextDueRow() {
            guard let operation = row.operation() else {
                // Unreadable payload — nothing useful can ever be uploaded.
                // Capture before dropping: this is the most invisible data-loss
                // path in the drain (a corrupted or schema-changed payload, else
                // discarded with no error, notice, or telemetry).
                ErrorReporter.captureWarning(
                    "Sync op parked: undecodable payload",
                    context: ["sync.type": row.type, "sync.seq": row.seq, "sync.outcome": "parked_undecodable"]
                )
                park(row, reason: "unreadable payload")
                errors.append("Could not sync a queued change (unreadable payload). It was kept so you can discard it.")
                continue
            }
            let isDelete = isDeleteOperation(operation)

            // The food is on this device but not on the server yet: a bulk import's upload
            // is still on its way. Not a failure and not a retry — it just is not due yet.
            if awaitsBulkUpload(operation) {
                row.nextAttemptAt = Date().addingTimeInterval(Self.bulkUploadWait)
                save()
                continue
            }

            // A create can reference a food/recipe that is itself still an
            // unresolved `temp_` id — the peer create is either still queued
            // behind its own backoff (this row's seq is due first because
            // `nextDueRow` skips backed-off rows) or was already dropped
            // without ever resolving. Catch this before spending a network
            // round trip on a request that would otherwise fail (a temp id
            // is never valid UUID shape) and get misreported.
            if let unresolved = unresolvedReference(operation) {
                // The peer create may already have drained (its temp row was
                // swapped for the server record) before this op captured the
                // temp id, e.g. a log started on a screen that still held it.
                // The durable mapping says which server id it became, so
                // rewrite the op instead of parking it as "never created".
                if let serverId = TempIdMap.lookup(unresolved.id),
                   let remapped = operation.remappingReferences(from: unresolved.id, to: serverId)
                {
                    row.replaceOperation(remapped)
                    if unresolved.table == "recipes" {
                        LocalRemap.remapRecipeReferences(from: unresolved.id, to: serverId, in: context)
                    } else {
                        LocalRemap.remapFoodReferences(from: unresolved.id, to: serverId, in: context)
                    }
                    save()
                    continue
                }
                // Only a create can resolve the id; an edit queued against the same temp id
                // (a label or favorite change) must not make this op wait for nothing.
                let peers = queuedOperations(table: unresolved.table, affectedId: unresolved.id).filter { peer in
                    peer.operation().map { isCreateOperation($0) } ?? false
                }
                if peers.contains(where: { $0.failedAt == nil }) {
                    // The peer create hasn't drained yet. Wait for it without
                    // treating this as a failure of this operation.
                    row.retryCount += 1
                    row.nextAttemptAt = backoffDate(retryCount: row.retryCount, id: row.id)
                    save()
                    continue
                }
                if !peers.isEmpty {
                    // The create it depends on is parked, so it will not resolve
                    // until the user retries it. Park this row too instead of
                    // waiting on it forever.
                    parkFailed(row, operation, reason: "the food or recipe it depended on could not be uploaded")
                    ErrorReporter.captureWarning(
                        "Sync op parked: referenced create is parked",
                        context: dropContext(operation, row, outcome: "parked_reference_parked", status: nil)
                    )
                    continue
                }
                // Nothing will ever resolve this `temp_` id: no queued create, no
                // recorded mapping. Recover the change rather than strand it.
                switch recoverUnresolvedReference(row, operation, unresolved: unresolved) {
                case .requeuedCreate, .droppedReference:
                    continue
                case let .quickEntry(name):
                    sawConflict = true
                    conflictDates.formUnion(dayKeys(for: operation))
                    if case let .createEntry(body, _) = operation {
                        noteConflict(L10n.syncRecoveredAsQuickEntry(name: name, day: body.date))
                    }
                    continue
                case .unrecoverable:
                    // Truly nothing left to rebuild it from. Park rather than delete:
                    // the change stays visible until the user decides.
                    parkFailed(row, operation, reason: "the food or recipe it depended on was never created")
                    ErrorReporter.captureWarning(
                        "Sync op parked: referenced create was never created",
                        context: dropContext(operation, row, outcome: "parked_reference_not_created", status: nil)
                    )
                    continue
                }
            }

            ErrorReporter.addBreadcrumb(
                "drain \(operation.typeName)",
                category: "sync",
                data: ["sync.op": operation.typeName, "sync.retry_count": row.retryCount]
            )
            do {
                try await execute(operation, idempotencyKey: row.idempotencyKey, clientEditedAt: row.clientEditedAt)
                if !row.isDeleted {
                    remove(row)
                }
                forgetEntrySnapshot(operation)
                processed += 1
            } catch {
                let kind = Self.classify(error, isOnline: connectivity.isOnline)
                var conflictBody: Data?
                if let apiError = error as? APIError, case let .conflict(_, body) = apiError {
                    conflictBody = body
                }
                switch kind {
                case .unauthorized:
                    errors.append("Session expired. Please log in again to sync pending changes.")
                    break drain

                case .conflict(serverNewer: true):
                    remove(row)
                    processed += 1
                    sawConflict = true
                    conflictDates.formUnion(dayKeys(for: operation))
                    noteConflict(
                        "Offline change to \(operation.summary) was superseded by a newer change from another device."
                    )

                case .conflict(serverNewer: false):
                    parkFailed(row, operation, reason: Self.conflictReason(body: conflictBody))
                    ErrorReporter.captureWarning(
                        "Sync op parked: validation conflict",
                        context: dropContext(operation, row, outcome: "parked_validation_conflict", status: 409)
                    )

                case .notFound where isDelete:
                    remove(row)
                    processed += 1

                // A create has no prior record of its own that could have been
                // "deleted on another device" — its only 404 comes from a
                // foodId/recipeId reference the server rejected as unowned/
                // missing (see `assertFoodOwned`/`assertRecipeOwned`
                // server-side). By this point `unresolvedReference` above has
                // already ruled out a still-`temp_` reference, so this is a
                // real server id that existed when the op was queued and is
                // gone now (e.g. the food was deleted before the offline
                // create finally drained).
                case .notFound where isCreateOperation(operation):
                    park(row, reason: "the referenced food or recipe no longer exists")
                    sawConflict = true
                    conflictDates.formUnion(dayKeys(for: operation))
                    noteConflict(droppedReferenceNotice(for: operation))
                    if case let .createEntry(body, _) = operation, let foodId = body.foodId {
                        missingFoodIds.insert(foodId)
                    }
                    ErrorReporter.captureWarning(
                        "Sync op parked: referenced record missing",
                        context: dropContext(operation, row, outcome: "parked_reference_missing", status: 404)
                    )

                case .notFound:
                    remove(row)
                    processed += 1
                    sawConflict = true
                    conflictDates.formUnion(dayKeys(for: operation))
                    noteConflict(
                        "Offline change to \(operation.summary) was lost: the record was deleted on another device."
                    )
                    ErrorReporter.captureWarning(
                        "Sync op lost: record deleted elsewhere",
                        context: dropContext(operation, row, outcome: "lost_deleted_elsewhere", status: 404)
                    )

                case let .clientError(status):
                    parkFailed(row, operation, reason: "HTTP \(status)")
                    ErrorReporter.captureWarning(
                        "Sync op parked: client error",
                        context: dropContext(operation, row, outcome: "parked_client_error", status: status)
                    )

                case .appliedUnreadable:
                    ErrorReporter.captureWarning(
                        "Sync op applied but response unreadable",
                        context: dropContext(operation, row, outcome: "applied_unreadable_response", status: nil)
                    )
                    if isCreateOperation(operation) {
                        // Without the created row's id the local placeholder cannot be
                        // remapped; keep the change visible instead of guessing.
                        parkFailed(row, operation, reason: "the server accepted it but its response could not be read")
                    } else {
                        remove(row)
                        processed += 1
                        sawConflict = true
                        conflictDates.formUnion(dayKeys(for: operation))
                    }

                case .offline:
                    break drain

                case .updateRequired:
                    // Neither retried nor dropped: the row, its retryCount and
                    // its idempotency key are left exactly as they are, so the
                    // same op uploads unchanged once the app is updated. Every
                    // other queued op is left untouched too — this ends the
                    // drain the same way `.offline`/`.serverUnavailable` do.
                    ErrorReporter.addBreadcrumb(
                        "drain paused: client update required",
                        category: "sync",
                        data: ["sync.op": operation.typeName]
                    )
                    break drain

                case .retryableOperation, .serverUnavailable:
                    // Retried indefinitely with capped backoff: the row is never dropped
                    // for being unlucky, only parked when the server rejects it for good.
                    row.retryCount += 1
                    row.nextAttemptAt = backoffDate(retryCount: row.retryCount, id: row.id)
                    save()
                    if case .serverUnavailable = kind {
                        // Abort. Every remaining op would hit the same outage, and
                        // because `nextDueRow` skips this backed-off row the drain
                        // would charge a retry to each of them.
                        break drain
                    }
                    // Per-operation failure: skip it. A backed-off row is filtered out
                    // by `nextDueRow`, so the loop advances to the next due op instead
                    // of stalling the whole queue behind this one.
                    continue
                }
            }
            refreshCounts()
        }
        // Once per drain, not once per conflict: a batch that lost three edits needs
        // a single refresh. Reached on every exit path — a drain that resolved a
        // conflict and then hit an outage still owes the UI that refresh.
        if sawConflict {
            await onConflictResolved?(conflictDates)
        }
        if !missingFoodIds.isEmpty {
            await onFoodReferenceMissing?(missingFoodIds)
        }
        return processed
    }

    /// The day(s) a conflicted operation touched, so the follow-up refresh
    /// reloads them rather than only today. An update or delete carries no date
    /// in its body, so the local row answers for it — for an update that row is
    /// still present (only the queued op was dropped); a locally deleted row
    /// has none, and today's refresh is the best available.
    private func dayKeys(for operation: SyncOperation) -> Set<String> {
        switch operation {
        case let .createEntry(body, _):
            return [body.date]
        case let .updateEntry(id, body):
            guard let date = body.date ?? localEntryDate(id: id) else { return [] }
            return [date]
        case let .deleteEntry(id):
            guard let date = localEntryDate(id: id) else { return [] }
            return [date]
        case let .setDayProperties(date, _), let .deleteDayProperties(date):
            return [date]
        case let .logSupplement(_, date), let .unlogSupplement(_, date):
            return [date]
        default:
            return []
        }
    }

    private func localEntryDate(id: String) -> String? {
        var descriptor = FetchDescriptor<LocalEntry>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first?.date
    }

    /// User-facing notice for a dropped create whose foodId/recipeId
    /// reference no longer exists server-side. Names the food and day for a
    /// `createEntry` so the user knows exactly what to re-log; every other
    /// create kind keeps the generic wording.
    private func droppedReferenceNotice(for operation: SyncOperation) -> String {
        guard case let .createEntry(body, _) = operation else {
            return "Offline change to \(operation.summary) was dropped: the referenced food or recipe no longer exists."
        }
        let name = body.foodId.flatMap(localFoodName) ?? body.quickName ?? L10n.syncDroppedEntryUnknownFood
        return L10n.syncDroppedEntryMissingFood(name: name, day: body.date)
    }

    private func localFoodName(id: String) -> String? {
        var descriptor = FetchDescriptor<LocalFood>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first?.name
    }

    /// Rewrites still-queued operation payloads (and their affected table/id
    /// columns) that reference a resolved `temp_` id, so chained offline
    /// creates upload with the server id (the queue-side counterpart of
    /// `LocalRemap`, which rewrites the local rows).
    func remapQueuedReferences(from oldId: String, to newId: String) {
        guard oldId != newId else { return }
        var changed = false
        for row in queuedRows() {
            guard let operation = row.operation(),
                  let remapped = operation.remappingReferences(from: oldId, to: newId)
            else { continue }
            row.replaceOperation(remapped)
            changed = true
        }
        if changed {
            save()
        }
    }

    // MARK: - Recovery of unresolvable references

    private enum Recovery {
        /// The local food/recipe still exists: its create was queued again, ahead of the dependent op.
        case requeuedCreate
        /// The entry was rewritten as a quick entry from the snapshot taken when it was logged.
        case quickEntry(name: String)
        /// A completion no longer waits on an entry that will never exist.
        case droppedReference
        case unrecoverable
    }

    /// What can be done with an op that references a `temp_` id nothing will ever
    /// resolve (no queued create, no `TempIdMap` entry), in order: rebuild the
    /// create from the local row, or turn an entry into a quick entry. Never
    /// deletes: `.unrecoverable` leaves it to the caller to park.
    private func recoverUnresolvedReference(
        _ row: PendingSyncOperation,
        _ operation: SyncOperation,
        unresolved: (table: String, id: String)
    ) -> Recovery {
        if unresolved.table == "entries" {
            // An AI-task completion waiting on an entry whose create was removed
            // (the user deleted the entry before it uploaded).
            guard case let .completeAiTask(taskId, localEntryIds, summary, processedBy, editedAt) = operation else {
                return .unrecoverable
            }
            let remaining = localEntryIds.filter { $0 != unresolved.id }
            row.replaceOperation(.completeAiTask(
                taskId: taskId, localEntryIds: remaining, resultSummary: summary,
                processedBy: processedBy, clientEditedAt: editedAt
            ))
            save()
            ErrorReporter.captureWarning(
                "Sync op recovered: completion no longer waits for a missing entry",
                context: dropContext(operation, row, outcome: "recovered_dropped_entry_reference", status: nil)
            )
            return .droppedReference
        }

        if requeueCreate(table: unresolved.table, id: unresolved.id, before: row) {
            ErrorReporter.captureWarning(
                "Sync op recovered: queued the missing create again",
                context: dropContext(operation, row, outcome: "recovered_requeued_create", status: nil)
            )
            return .requeuedCreate
        }

        if case let .createEntry(body, localId) = operation,
           let name = convertToQuickEntry(row, body: body, localId: localId)
        {
            ErrorReporter.captureWarning(
                "Sync op recovered: entry logged as a quick entry",
                context: dropContext(operation, row, outcome: "recovered_quick_entry", status: nil)
            )
            return .quickEntry(name: name)
        }
        return .unrecoverable
    }

    /// Queues a fresh create for a food/recipe that still exists locally under
    /// its `temp_` id, and moves `dependent` behind it so it drains first.
    private func requeueCreate(table: String, id: String, before dependent: PendingSyncOperation) -> Bool {
        let create: SyncOperation
        switch table {
        case "foods":
            guard let food = LocalRemap.foodRow(id: id, in: context)?.toFood(),
                  let body = foodCreate(from: food)
            else { return false }
            create = .createFood(body: body, localId: id)
        case "recipes":
            guard let recipe = LocalRemap.recipeRow(id: id, in: context)?.toRecipe() else { return false }
            create = .createRecipe(body: recipeCreate(from: recipe), localId: id)
        default:
            return false
        }
        insertOperation(create)
        save()
        dependent.seq = nextSeq()
        dependent.nextAttemptAt = Date.distantPast
        save()
        refreshCounts()
        return true
    }

    private func foodCreate(from food: Food) -> FoodCreate? {
        guard var create = try? JSONPatch.decode(FoodCreate.self, from: JSONPatch.dictionary(of: food)) else {
            return nil
        }
        create.imageUrl = Self.uploadableImageUrl(food.imageUrl)
        return create
    }

    private func recipeCreate(from recipe: Recipe) -> RecipeCreate {
        let steps = RecipeStepInput.sanitized(recipe.orderedSteps.map {
            RecipeStepInput(text: $0.text, imageUrl: Self.uploadableImageUrl($0.imageUrl))
        })
        let ingredients = (recipe.ingredients ?? []).map {
            RecipeIngredientInput(foodId: $0.foodId, quantity: $0.quantity, servingUnit: $0.servingUnit)
        }
        return RecipeCreate(
            name: recipe.name,
            totalServings: recipe.totalServings,
            ingredients: ingredients,
            isFavorite: recipe.isFavorite,
            imageUrl: Self.uploadableImageUrl(recipe.imageUrl),
            cookedWeight: recipe.cookedWeight,
            steps: steps.isEmpty ? nil : steps
        )
    }

    /// The server only accepts a `/`-relative path or an http(s) URL; a local
    /// `file://` photo would turn the re-queued create into a permanent 400.
    private static func uploadableImageUrl(_ imageUrl: String?) -> String? {
        guard let imageUrl else { return nil }
        if imageUrl.hasPrefix("http://") || imageUrl.hasPrefix("https://") { return imageUrl }
        if imageUrl.hasPrefix("/"), !imageUrl.hasPrefix("//") { return imageUrl }
        return nil
    }

    /// Records name and per-serving macros of the food/recipe a `createEntry`
    /// logs, while the optimistic local rows that carry them still exist.
    private func captureEntrySnapshot(for operation: SyncOperation) {
        guard case let .createEntry(body, localId) = operation,
              body.foodId != nil || body.recipeId != nil,
              let snapshot = currentEntrySnapshot(body: body, localId: localId)
        else { return }
        QueuedEntrySnapshots.record(entryId: localId, snapshot: snapshot)
    }

    private func forgetEntrySnapshot(_ operation: SyncOperation) {
        if case let .createEntry(_, localId) = operation {
            QueuedEntrySnapshots.forget(entryId: localId)
        }
    }

    /// The recorded snapshot, else whatever the local rows still say (a queue row
    /// from before snapshots existed has none recorded).
    private func entrySnapshot(body: EntryCreate, localId: String) -> QueuedEntrySnapshot? {
        QueuedEntrySnapshots.lookup(entryId: localId) ?? currentEntrySnapshot(body: body, localId: localId)
    }

    private func currentEntrySnapshot(body: EntryCreate, localId: String) -> QueuedEntrySnapshot? {
        if let entry = LocalRemap.entryRow(id: localId, in: context)?.toEntry(),
           let snapshot = QueuedEntrySnapshot(entry: entry)
        {
            return snapshot
        }
        if let foodId = body.foodId, let food = LocalRemap.foodRow(id: foodId, in: context)?.toFood() {
            return QueuedEntrySnapshot(food: food)
        }
        if let recipeId = body.recipeId, let recipe = LocalRemap.recipeRow(id: recipeId, in: context)?.toRecipe() {
            return QueuedEntrySnapshot(recipe: recipe)
        }
        return nil
    }

    /// Rewrites a queued `createEntry` as a quick entry (same meal, date, servings
    /// and eaten time) and mirrors that onto the optimistic local row. Returns the
    /// entry's name, or nil when there is no snapshot to build it from.
    private func convertToQuickEntry(_ row: PendingSyncOperation, body: EntryCreate, localId: String) -> String? {
        guard let snapshot = entrySnapshot(body: body, localId: localId) else { return nil }
        var quick = body
        quick.foodId = nil
        quick.recipeId = nil
        quick.quickName = snapshot.name
        quick.quickCalories = snapshot.calories
        quick.quickProtein = snapshot.protein
        quick.quickCarbs = snapshot.carbs
        quick.quickFat = snapshot.fat
        quick.quickFiber = snapshot.fiber
        if quick.notes?.isEmpty ?? true {
            quick.notes = L10n.syncRecoveredEntryNote
        }
        row.replaceOperation(.createEntry(body: quick, localId: localId))
        if let local = LocalRemap.entryRow(id: localId, in: context), let entry = local.toEntry() {
            let patched = Entry(
                id: entry.id,
                mealType: entry.mealType,
                servings: entry.servings,
                notes: quick.notes,
                foodId: nil,
                recipeId: nil,
                supplementId: entry.supplementId,
                quickName: snapshot.name,
                quickCalories: snapshot.calories,
                quickProtein: snapshot.protein,
                quickCarbs: snapshot.carbs,
                quickFat: snapshot.fat,
                quickFiber: snapshot.fiber,
                quickNutrients: entry.quickNutrients,
                foodName: entry.foodName ?? snapshot.name,
                calories: entry.calories ?? snapshot.calories,
                protein: entry.protein ?? snapshot.protein,
                carbs: entry.carbs ?? snapshot.carbs,
                fat: entry.fat ?? snapshot.fat,
                fiber: entry.fiber ?? snapshot.fiber,
                imageUrl: entry.imageUrl,
                servingSize: entry.servingSize,
                servingUnit: entry.servingUnit,
                date: entry.date,
                eatenAt: entry.eatenAt,
                createdAt: entry.createdAt,
                updatedAt: entry.updatedAt
            )
            local.update(from: patched, date: local.date)
        }
        save()
        return snapshot.name
    }

    // MARK: - Dependents of a create

    private func insertOperation(_ operation: SyncOperation) {
        context.insert(PendingSyncOperation(seq: nextSeq(), operation: operation))
    }

    /// Queued or parked rows, other than `excluding`, that carry a reference to
    /// the food/recipe `id` (an entry logging it, a recipe or supplement using it).
    private func dependentRows(table: String, id: String, excluding: PendingSyncOperation?) -> [PendingSyncOperation] {
        let excludedId = excluding?.id
        return queuedRows().filter { candidate in
            guard candidate.id != excludedId, let operation = candidate.operation() else { return false }
            return references(of: operation).contains { $0.table == table && $0.id == id }
        }
    }

    /// How many other queued or parked writes wait on this row's create. Zero
    /// unless `row` is a create-food/create-recipe. Lets the UI warn before a
    /// discard (see `discardParked`).
    func dependentCount(of row: PendingSyncOperation) -> Int {
        guard let operation = row.operation(), isCreateOperation(operation),
              let table = operation.affectedTable, table == "foods" || table == "recipes",
              let id = row.affectedId
        else { return 0 }
        return dependentRows(table: table, id: id, excluding: row).count
    }

    /// Settles the writes that waited on a food/recipe create that is going away,
    /// without deleting any: entries become quick entries and are due again at
    /// once; anything else is parked with a reason. Returns the days touched.
    @discardableResult
    private func detachDependents(table: String, id: String, excluding: PendingSyncOperation?) -> Set<String> {
        var dates: Set<String> = []
        for dependent in dependentRows(table: table, id: id, excluding: excluding) {
            guard let operation = dependent.operation() else { continue }
            if case let .createEntry(body, localId) = operation,
               convertToQuickEntry(dependent, body: body, localId: localId) != nil
            {
                dates.insert(body.date)
                if dependent.failedAt != nil {
                    unpark(dependent)
                } else {
                    dependent.nextAttemptAt = Date.distantPast
                }
            } else {
                park(dependent, reason: L10n.syncDependencyDiscarded)
            }
        }
        save()
        refreshCounts()
        return dates
    }

    /// The discard side of `detachDependents`: also removes the never-uploaded
    /// local food/recipe row, which no create is left to upload.
    private func releaseDependents(of row: PendingSyncOperation, operation: SyncOperation) -> Set<String> {
        guard isCreateOperation(operation), let table = operation.affectedTable,
              table == "foods" || table == "recipes",
              let id = row.affectedId, LocalStore.isTempId(id)
        else { return [] }
        let dates = detachDependents(table: table, id: id, excluding: row)
        if table == "foods", let placeholder = LocalRemap.foodRow(id: id, in: context) {
            context.delete(placeholder)
            IntentDonations.removeFoods([id])
        } else if table == "recipes", let placeholder = LocalRemap.recipeRow(id: id, in: context) {
            context.delete(placeholder)
        }
        return dates
    }

    // MARK: - Execution

    private func execute(_ operation: SyncOperation, idempotencyKey: String, clientEditedAt: String) async throws {
        switch operation {
        case let .createFood(body, localId):
            let server = try await api.createFood(body, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)
            guard LocalRemap.foodRow(id: localId, in: context) != nil else {
                enqueue(.deleteFood(id: server.id, force: false))
                return
            }
            LocalRemap.replaceFood(id: localId, with: server, in: context)
            remapQueuedReferences(from: localId, to: server.id)

        case let .updateFood(id, body):
            _ = try await api.updateFood(id: id, body, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)

        case let .deleteFood(id, force):
            try await api.deleteFood(
                id: id,
                force: force,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )

        case let .toggleFavorite(id, isFavorite):
            _ = try await api.toggleFavorite(
                foodId: id,
                isFavorite: isFavorite,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )

        case let .setFoodImage(id, imageUrl):
            _ = try await api.setFoodImage(
                id: id,
                imageUrl: imageUrl,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )

        case let .setFoodLabels(id, labels):
            _ = try await api.setFoodLabels(
                id: id,
                labels: labels,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )

        case let .addGeneratedFoodLabels(id, labels):
            // A machine write, not the device's own edit: no clientEditedAt,
            // so it never wins last-write-wins over an edit the user actually
            // made on another device.
            _ = try await api.setFoodLabels(
                id: id,
                labels: labels,
                source: "llm",
                mode: "extend",
                idempotencyKey: idempotencyKey,
                clientEditedAt: nil
            )

        case let .createEntry(body, localId):
            let server = try await api.createEntry(body, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)
            guard let local = LocalRemap.entryRow(id: localId, in: context)?.toEntry() else {
                enqueue(.deleteEntry(id: server.id))
                return
            }
            let merged = EntryRepository.merge(server: server, local: local)
            LocalRemap.replaceEntry(id: localId, with: merged, date: merged.date ?? body.date, in: context)
            remapQueuedReferences(from: localId, to: server.id)

        case let .updateEntry(id, body):
            _ = try await api.updateEntry(id: id, body, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)

        case let .deleteEntry(id):
            try await api.deleteEntry(id: id, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)

        case let .createRecipe(body, localId):
            let server = try await api.createRecipe(
                body,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )
            guard LocalRemap.recipeRow(id: localId, in: context) != nil else {
                enqueue(.deleteRecipe(id: server.id, force: false))
                return
            }
            LocalRemap.replaceRecipe(id: localId, with: server, in: context)
            remapQueuedReferences(from: localId, to: server.id)

        case let .updateRecipe(id, body):
            _ = try await api.updateRecipe(id: id, body, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)

        case let .setRecipeImage(id, imageUrl):
            _ = try await api.setRecipeImage(
                id: id,
                imageUrl: imageUrl,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )

        case let .deleteRecipe(id, force):
            try await api.deleteRecipe(
                id: id,
                force: force,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )

        case let .setGoals(body):
            _ = try await api.setGoals(body, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)

        case let .createWeight(body, localId):
            let server = try await api.createWeightEntry(
                body,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )
            guard LocalRemap.weightRow(id: localId, in: context) != nil else {
                enqueue(.deleteWeight(id: server.id))
                return
            }
            LocalRemap.replaceWeight(id: localId, with: server, in: context)
            remapQueuedReferences(from: localId, to: server.id)

        case let .updateWeight(id, body):
            _ = try await api.updateWeightEntry(
                id: id,
                body,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )

        case let .deleteWeight(id):
            try await api.deleteWeightEntry(id: id, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)

        case let .createSleep(body, localId):
            let server = try await api.createSleepEntry(
                body,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )
            guard LocalRemap.sleepRow(id: localId, in: context) != nil else {
                enqueue(.deleteSleep(id: server.id))
                return
            }
            LocalRemap.replaceSleep(id: localId, with: server, in: context)
            remapQueuedReferences(from: localId, to: server.id)

        case let .updateSleep(id, body):
            _ = try await api.updateSleepEntry(
                id: id,
                body,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )

        case let .deleteSleep(id):
            try await api.deleteSleepEntry(id: id, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)

        case let .createSupplement(body, localId):
            let server = try await api.createSupplement(
                body,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )
            guard LocalRemap.supplementRow(id: localId, in: context) != nil else {
                enqueue(.deleteSupplement(id: server.id))
                return
            }
            LocalRemap.replaceSupplement(id: localId, with: server, rekeyLogIds: false, in: context)
            remapQueuedReferences(from: localId, to: server.id)

        case let .updateSupplement(id, body):
            _ = try await api.updateSupplement(
                id: id,
                body,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )

        case let .deleteSupplement(id):
            try await api.deleteSupplement(id: id, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)

        case let .logSupplement(supplementId, date):
            _ = try await api.logSupplement(
                id: supplementId,
                date: date,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )

        case let .unlogSupplement(supplementId, date):
            try await api.unlogSupplement(
                id: supplementId,
                date: date,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )

        case let .createReminder(body, localId):
            let server = try await api.createReminder(
                body,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )
            guard LocalRemap.reminderRow(id: localId, in: context) != nil else {
                enqueue(.deleteReminder(id: server.id))
                return
            }
            LocalRemap.replaceReminder(id: localId, with: server, in: context)
            remapQueuedReferences(from: localId, to: server.id)

        case let .updateReminder(id, body):
            _ = try await api.updateReminder(
                id: id,
                body,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )

        case let .deleteReminder(id):
            try await api.deleteReminder(id: id, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)

        case let .setDayProperties(date, patch):
            _ = try await api.setDayProperties(
                date: date,
                patch: patch,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )

        case let .deleteDayProperties(date):
            try await api.deleteDayProperties(
                date: date,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )

        case let .upsertFast(_, body):
            _ = try await api.upsertFastingSession(
                body,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )

        case let .deleteFast(id):
            try await api.deleteFastingSession(
                id: id,
                idempotencyKey: idempotencyKey,
                clientEditedAt: clientEditedAt
            )

        case let .updatePreferences(body):
            _ = try await api.updatePreferences(body, idempotencyKey: idempotencyKey, clientEditedAt: clientEditedAt)

        // Ignores the row's own `clientEditedAt` (enqueue time, i.e. when this
        // completion was queued) — see `SyncOperation.completeAiTask` for why
        // that would be too late to catch an edit made *during* processing.
        // Carries its own guard timestamp instead: the task's server
        // `updatedAt` as last confirmed before anything was logged.
        case let .completeAiTask(taskId, localEntryIds, resultSummary, processedBy, snapshotClientEditedAt):
            let update = AiTaskUpdate(
                status: "completed",
                resultSummary: resultSummary,
                processedBy: processedBy,
                createdEntryIds: localEntryIds
            )
            do {
                _ = try await api.updateAiTask(
                    id: taskId, update, idempotencyKey: idempotencyKey, clientEditedAt: snapshotClientEditedAt
                )
            } catch let error as APIError {
                guard case let .conflict(serverNewer, _) = error, serverNewer, snapshotClientEditedAt != nil else {
                    throw error
                }
                // The guard fired: the task changed on another device in the
                // narrow window between the caller's last freshness check and
                // this upload landing. The entries it logged are real food
                // that was actually eaten and already exist regardless of
                // this call's outcome — dropping the completion here (the
                // generic conflict handling below) would leave the task
                // "pending" forever and get it reprocessed into duplicate
                // entries on the next refresh. Force it through
                // unconditionally instead: the completion payload never
                // touches the task's editable content (description/photos/
                // date/mealType/eatenAt — see `AiTaskUpdate`), so the only
                // thing this can ever overwrite is another status change
                // racing the exact same task, which is strictly better than
                // one stuck pending or logged twice.
                _ = try await api.updateAiTask(id: taskId, update, idempotencyKey: idempotencyKey)
            }
        }
    }

    // MARK: - Error classification

    private enum FailureKind {
        case unauthorized
        case conflict(serverNewer: Bool)
        case notFound
        case clientError(Int)
        case offline
        /// The payload, not the server: this one operation is at fault and the rest
        /// of the queue is unaffected.
        case retryableOperation
        /// A 2xx whose body this build cannot read: the server already applied the
        /// change, so retrying can never help and only replays the same response.
        case appliedUnreadable
        /// The server or the transport is failing, so every queued operation would
        /// fail the same way.
        case serverUnavailable
        /// HTTP 426 — this build is older than the server's minimum supported
        /// version. Neither of the above: the operation isn't at fault (it will
        /// succeed unchanged once the app is updated) and the server isn't down
        /// either, so this gets its own drain outcome — pause, don't retry or
        /// drop (see the `.updateRequired` case in `drainPendingQueue`).
        case updateRequired
    }

    private static func classify(_ error: Error, isOnline: Bool) -> FailureKind {
        guard let apiError = error as? APIError else {
            // Unknown throws default to server-scoped: mistaking a global failure for a
            // per-operation one dead-letters the whole queue, while the reverse only
            // stalls it behind a backed-off op.
            return isConnectivityError(error, isOnline: isOnline) ? .offline : .serverUnavailable
        }
        switch apiError {
        case .unauthorized:
            return .unauthorized
        case let .conflict(serverNewer, _):
            return .conflict(serverNewer: serverNewer)
        case .notFound:
            return .notFound
        case .gone:
            return .notFound
        case .badRequest:
            return .clientError(400)
        case let .serverError(status, _):
            if transientClientStatuses.contains(status) { return .serverUnavailable }
            return status < 500 ? .clientError(status) : .serverUnavailable
        case let .networkError(underlying):
            return isConnectivityError(underlying, isOnline: isOnline) ? .offline : .serverUnavailable
        case let .decodingError(_, statusCode, _):
            // A 2xx we cannot read means the server accepted the change.
            if (200..<300).contains(statusCode) { return .appliedUnreadable }
            // Anything else is a contract mismatch on one endpoint, not an outage —
            // the ops queued behind it may well upload fine.
            return .retryableOperation
        case .updateRequired:
            return .updateRequired
        }
    }

    /// Obvious "the device has no connection" URLErrors. `.timedOut` only
    /// counts while the connectivity monitor reports offline — online
    /// timeouts may be a struggling server and should consume retries.
    private static func isConnectivityError(_ error: Error, isOnline: Bool) -> Bool {
        guard let urlError = error as? URLError else { return false }
        switch urlError.code {
        case .notConnectedToInternet, .networkConnectionLost, .cannotFindHost:
            return true
        case .timedOut:
            return !isOnline
        default:
            return false
        }
    }

    private func isDeleteOperation(_ operation: SyncOperation) -> Bool {
        switch operation {
        case .deleteFood, .deleteEntry, .deleteRecipe, .deleteWeight,
             .deleteSupplement, .deleteSleep, .deleteDayProperties,
             .deleteFast, .unlogSupplement, .deleteReminder:
            true
        default:
            false
        }
    }

    /// Ops that insert a brand-new server row. These have no prior record of
    /// their own — a 404 they hit can only be a rejected foodId/recipeId
    /// reference, never "this row was deleted elsewhere".
    private func isCreateOperation(_ operation: SyncOperation) -> Bool {
        switch operation {
        case .createFood, .createEntry, .createRecipe, .createWeight, .createSleep, .createSupplement,
             .createReminder:
            true
        default:
            false
        }
    }

    /// The first still-`temp_` foodId/recipeId/entryId a create (or, for
    /// `completeAiTask`, a completion) references, with the queue table it
    /// would have been created under, or nil when every reference is already
    /// a resolved server id (or the op has none). Only
    /// `create_entry`/`create_recipe`/`create_supplement`/`complete_ai_task`
    /// carry such a reference — the other ops don't point at another entity.
    private func unresolvedReference(_ operation: SyncOperation) -> (table: String, id: String)? {
        references(of: operation).first { LocalStore.isTempId($0.id) }
    }

    /// Whether the operation targets, or refers to, an imported food still waiting for its
    /// bulk upload. Deleting one is exempt: the server not knowing the food is the outcome
    /// a delete wants, and the upload skips a food that is gone.
    private func awaitsBulkUpload(_ operation: SyncOperation) -> Bool {
        guard let isAwaiting = isAwaitingBulkUpload, !isDeleteOperation(operation) else { return false }
        var foodIds = references(of: operation).filter { $0.table == "foods" }.map { $0.id }
        if operation.affectedTable == "foods", let id = operation.affectedId { foodIds.append(id) }
        return foodIds.contains { !LocalStore.isTempId($0) && isAwaiting($0) }
    }

    private func references(of operation: SyncOperation) -> [(table: String, id: String)] {
        let candidates: [(table: String, id: String)]
        switch operation {
        case let .createEntry(body, _):
            var refs: [(table: String, id: String)] = []
            if let foodId = body.foodId { refs.append((table: "foods", id: foodId)) }
            if let recipeId = body.recipeId { refs.append((table: "recipes", id: recipeId)) }
            candidates = refs
        case let .createRecipe(body, _):
            candidates = body.ingredients.map { (table: "foods", id: $0.foodId) }
        case let .createSupplement(body, _):
            candidates = body.ingredients.compactMap { ingredient -> (table: String, id: String)? in
                guard let foodId = ingredient.foodId else { return nil }
                return (table: "foods", id: foodId)
            }
        case let .completeAiTask(_, localEntryIds, _, _, _):
            candidates = localEntryIds.map { (table: "entries", id: $0) }
        default:
            candidates = []
        }
        return candidates
    }

    // MARK: - Backoff

    private func backoffDate(retryCount: Int, id: UUID) -> Date {
        let base = Self.backoffBase * pow(2.0, Double(min(retryCount, 20)))
        let jitter = Self.backoffJitter * Double(id.hashValue & 0xFF) / 255.0
        let delay = min(base + jitter, Self.backoffCap)
        return Date().addingTimeInterval(delay)
    }

    // MARK: - Store helpers

    /// Next queued row whose backoff has expired (nextAttemptAt <= now), in FIFO order.
    private func nextDueRow() -> PendingSyncOperation? {
        let now = Date()
        let descriptor = FetchDescriptor<PendingSyncOperation>(
            predicate: #Predicate { $0.nextAttemptAt <= now && $0.failedAt == nil },
            sortBy: [SortDescriptor(\.seq)]
        )
        var limited = descriptor
        limited.fetchLimit = 1
        return (try? context.fetch(limited))?.first
    }

    /// Queue depth without materialising or sorting the rows. `queuedRows()`
    /// fetches every queued operation, sorted by `seq`, purely to read
    /// `.count` — and that ran on every enqueue, after each drain iteration
    /// and on every retry schedule.
    private func queuedCount() -> Int {
        let descriptor = FetchDescriptor<PendingSyncOperation>(predicate: #Predicate { $0.failedAt == nil })
        return (try? context.fetchCount(descriptor)) ?? 0
    }

    private func parkedCount() -> Int {
        let descriptor = FetchDescriptor<PendingSyncOperation>(predicate: #Predicate { $0.failedAt != nil })
        return (try? context.fetchCount(descriptor)) ?? 0
    }

    private func refreshCounts() {
        pendingCount = queuedCount()
        failedCount = parkedCount()
    }

    // MARK: - Parked (permanently rejected) changes

    /// Rows the server permanently rejected, oldest first. They stay in the store,
    /// out of the drain, until the user retries or discards them.
    func parkedRows() -> [PendingSyncOperation] {
        let descriptor = FetchDescriptor<PendingSyncOperation>(
            predicate: #Predicate { $0.failedAt != nil },
            sortBy: [SortDescriptor(\.seq)]
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    private func park(_ row: PendingSyncOperation, reason: String) {
        row.failedAt = Date()
        row.failureReason = reason
        save()
        refreshCounts()
    }

    private func parkFailed(_ row: PendingSyncOperation, _ operation: SyncOperation, reason: String) {
        park(row, reason: reason)
        errors.append("Could not sync \(describe(operation)) (\(reason)). It was kept so you can retry or discard it.")
    }

    /// `operation.summary`, with the food's name in place of its raw id where
    /// the local mirror (or the queued body) knows it.
    private func describe(_ operation: SyncOperation) -> String {
        switch operation {
        case let .createFood(body, _):
            return "create food \"\(body.name)\""
        case let .updateFood(id, body):
            let name = localFoodName(id: id) ?? body.name
            return "update food \"\(name)\""
        case let .deleteFood(id, _):
            guard let name = localFoodName(id: id) else { return operation.summary }
            return "delete food \"\(name)\""
        default:
            return operation.summary
        }
    }

    /// The parked reason for an `X-Sync-Conflict`-less 409, read from the
    /// server's `{error}` body. `foods.ts` answers a duplicate barcode with
    /// `A food with barcode X already exists: "Name"`, and `errors.ts` with the
    /// bare `duplicate_barcode` code when the name lookup was not available.
    static func conflictReason(body: Data?) -> String {
        guard let body,
              let json = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
              let message = (json["error"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
              !message.isEmpty
        else { return L10n.syncConflictGeneric }
        if message == "duplicate_barcode" { return L10n.syncBarcodeInUse }
        if message.hasPrefix("A food with barcode"), message.contains("already exists") {
            if let open = message.firstIndex(of: "\""), let close = message.lastIndex(of: "\""), open < close {
                let name = String(message[message.index(after: open) ..< close])
                if !name.isEmpty, name != "unknown" { return L10n.syncBarcodeInUse(by: name) }
            }
            return L10n.syncBarcodeInUse
        }
        return message.contains(" ") ? message : L10n.syncConflictGeneric
    }

    /// Puts a parked change back in line for the next drain.
    func retryParked(_ row: PendingSyncOperation) {
        guard row.failedAt != nil else { return }
        unpark(row)
        save()
        refreshCounts()
        scheduleDrain()
    }

    func retryAllParked() {
        for row in parkedRows() {
            unpark(row)
        }
        save()
        refreshCounts()
        scheduleDrain()
    }

    private func unpark(_ row: PendingSyncOperation) {
        row.failedAt = nil
        row.failureReason = nil
        row.retryCount = 0
        row.nextAttemptAt = Date.distantPast
    }

    /// Deletes a parked change on the user's say-so. Only parked rows can be
    /// discarded here; a live queued row is never touched.
    ///
    /// Discarding a create-food/create-recipe never orphans the writes that
    /// were waiting on it (see `dependentCount(of:)`): queued entries for it
    /// become quick entries and go back in line to upload; any other dependent
    /// (a recipe or supplement using the food) is parked with a reason, not
    /// deleted. The never-uploaded local placeholder row goes with the create,
    /// so it cannot be logged again against an id the server never had.
    func discardParked(_ row: PendingSyncOperation) {
        guard row.failedAt != nil else { return }
        let operation = row.operation()
        var dates = operation.map { dayKeys(for: $0) } ?? []
        if let operation {
            dates.formUnion(releaseDependents(of: row, operation: operation))
            forgetEntrySnapshot(operation)
        }
        context.delete(row)
        save()
        refreshCounts()
        // Pull server state back so an optimistic local row for the discarded change goes away.
        Task { [weak self] in
            await self?.onConflictResolved?(dates)
        }
    }

    /// All queued rows in FIFO order.
    func queuedRows() -> [PendingSyncOperation] {
        let descriptor = FetchDescriptor<PendingSyncOperation>(sortBy: [SortDescriptor(\.seq)])
        return (try? context.fetch(descriptor)) ?? []
    }

    private func nextSeq() -> Int {
        PendingSyncOperation.nextSeq(in: context)
    }

    private func save() {
        context.saveReportingFailure("SyncManager.save")
    }

    /// Structured context for a permanent-drop Sentry warning so a "changes won't
    /// sync" report is unambiguous from telemetry alone (which op, how many
    /// retries, the stable idempotency key, and why it was dropped).
    private func dropContext(
        _ operation: SyncOperation,
        _ row: PendingSyncOperation,
        outcome: String,
        status: Int?
    ) -> [String: Any] {
        var context: [String: Any] = [
            "sync.op": operation.typeName,
            "sync.summary": operation.summary,
            "sync.retry_count": row.retryCount,
            "sync.idempotency_key": row.idempotencyKey,
            "sync.outcome": outcome,
        ]
        if let status {
            context["status_code"] = status
        }
        for (key, value) in referenceIds(operation) {
            context[key] = value
        }
        return context
    }

    /// Every entity id an operation carries (its own row plus anything it
    /// references), keyed for Sentry so a dropped-sync event shows exactly
    /// which record(s) were involved without decoding `sync.summary`. Ids
    /// only — never notes, food/recipe/supplement names, or other user
    /// content.
    private func referenceIds(_ operation: SyncOperation) -> [String: Any] {
        var ids: [String: Any] = [:]
        switch operation {
        case let .createFood(_, localId):
            ids["sync.food_id"] = localId
        case let .updateFood(id, _), let .deleteFood(id, _), let .toggleFavorite(id, _),
             let .setFoodImage(id, _), let .setFoodLabels(id, _), let .addGeneratedFoodLabels(id, _):
            ids["sync.food_id"] = id

        case let .createEntry(body, localId):
            ids["sync.entry_id"] = localId
            if let foodId = body.foodId { ids["sync.food_id"] = foodId }
            if let recipeId = body.recipeId { ids["sync.recipe_id"] = recipeId }
        // `EntryUpdate` carries no foodId/recipeId — the app never lets an
        // edit reassign an entry's food or recipe, only servings/meal/notes/
        // date/eatenAt/quick fields, so there is no reference to record here.
        case let .updateEntry(id, _):
            ids["sync.entry_id"] = id
        case let .deleteEntry(id):
            ids["sync.entry_id"] = id

        case let .createRecipe(body, localId):
            ids["sync.recipe_id"] = localId
            ids["sync.ingredient_food_ids"] = body.ingredients.map(\.foodId)
        case let .updateRecipe(id, body):
            ids["sync.recipe_id"] = id
            if let ingredients = body.ingredients {
                ids["sync.ingredient_food_ids"] = ingredients.map(\.foodId)
            }
        case let .setRecipeImage(id, _), let .deleteRecipe(id, _):
            ids["sync.recipe_id"] = id

        case .setGoals:
            break

        case let .createWeight(_, localId):
            ids["sync.weight_id"] = localId
        case let .updateWeight(id, _), let .deleteWeight(id):
            ids["sync.weight_id"] = id

        case let .createSleep(_, localId):
            ids["sync.sleep_id"] = localId
        case let .updateSleep(id, _), let .deleteSleep(id):
            ids["sync.sleep_id"] = id

        case let .createSupplement(body, localId):
            ids["sync.supplement_id"] = localId
            let foodIds = body.ingredients.compactMap(\.foodId)
            if !foodIds.isEmpty { ids["sync.ingredient_food_ids"] = foodIds }
        case let .updateSupplement(id, body):
            ids["sync.supplement_id"] = id
            if let ingredients = body.ingredients {
                let foodIds = ingredients.compactMap(\.foodId)
                if !foodIds.isEmpty { ids["sync.ingredient_food_ids"] = foodIds }
            }
        case let .deleteSupplement(id):
            ids["sync.supplement_id"] = id
        case let .logSupplement(supplementId, _), let .unlogSupplement(supplementId, _):
            ids["sync.supplement_id"] = supplementId

        case let .createReminder(_, localId):
            ids["sync.reminder_id"] = localId
        case let .updateReminder(id, _), let .deleteReminder(id):
            ids["sync.reminder_id"] = id

        case let .setDayProperties(date, _), let .deleteDayProperties(date):
            ids["sync.day"] = date

        case let .upsertFast(id, _), let .deleteFast(id):
            ids["sync.fast_id"] = id

        case .updatePreferences:
            break

        case let .completeAiTask(taskId, localEntryIds, _, _, _):
            ids["sync.ai_task_id"] = taskId
            ids["sync.entry_ids"] = localEntryIds
        }
        return ids
    }

    /// After a drain leaves backed-off rows behind, schedule a single delayed
    /// re-drain at the soonest `nextAttemptAt`. `scheduleDrain` otherwise only
    /// fires on enqueue / connectivity-regained / foreground, none of which is
    /// guaranteed while a backoff window elapses — so a transient failure would
    /// leave `pendingCount > 0` until the user happens to trigger another drain.
    private func scheduleRetryDrain() {
        guard autoDrain else { return }
        retryTask?.cancel()
        let now = Date()
        // Asks the store for the single soonest backed-off row rather than
        // loading the whole queue to take a minimum over it.
        var descriptor = FetchDescriptor<PendingSyncOperation>(
            predicate: #Predicate { $0.nextAttemptAt > now && $0.failedAt == nil },
            sortBy: [SortDescriptor(\.nextAttemptAt)]
        )
        descriptor.fetchLimit = 1
        guard let soonest = (try? context.fetch(descriptor))?.first?.nextAttemptAt else {
            retryTask = nil
            return
        }
        let delay = max(soonest.timeIntervalSinceNow, 0)
        retryTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard !Task.isCancelled else { return }
            self?.scheduleDrain()
        }
    }

    /// User-initiated retry from the pending-changes screen: clear all backoff so
    /// every queued op is due immediately, then drain.
    func retryNow() {
        for row in queuedRows() where row.failedAt == nil {
            row.nextAttemptAt = Date.distantPast
        }
        save()
        scheduleDrain()
    }

    /// Test seam: resets `nextAttemptAt` on all queued rows so the next drain
    /// picks them up immediately, bypassing the exponential backoff delay.
    func resetBackoffForTesting() {
        for row in queuedRows() {
            row.nextAttemptAt = Date.distantPast
        }
        save()
    }
}
