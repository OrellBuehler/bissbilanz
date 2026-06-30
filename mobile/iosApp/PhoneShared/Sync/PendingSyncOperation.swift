import Foundation
import SwiftData

/// One persisted row of the offline sync queue. Ordered FIFO by `seq`
/// (monotonically increasing, assigned at enqueue time on the main actor);
/// `createdAt` is informational. The `affectedTable`/`affectedId` columns make
/// temp-id coalescing lookups cheap without decoding every payload.
/// Shares the single store with the data models, so it must also be
/// CloudKit-compatible (no unique constraint, every non-optional attribute
/// defaulted) for the store to validate when CloudKit is enabled in Local mode.
/// It's only ever written in Synced mode (CloudKit off) and stays empty in Local
/// mode, so it never actually syncs — this is purely a schema requirement.
///
/// `idempotencyKey` is generated once at enqueue and kept stable across all
/// retries of the same queued item. `clientEditedAt` is the ISO-8601 instant
/// captured when the user made the edit (enqueue time). Both are sent as
/// request headers so the server can deduplicate and apply last-write-wins.
/// `nextAttemptAt` is the earliest Date at which the item may next be drained
/// (exponential backoff after transient failures).
@Model
final class PendingSyncOperation {
    var id: UUID = UUID()
    var seq: Int = 0
    var createdAt: Date = Date()
    var type: String = ""
    var payload: Data = Data()
    var affectedTable: String?
    var affectedId: String?
    var retryCount: Int = 0
    var idempotencyKey: String = UUID().uuidString
    var clientEditedAt: String = ISO8601DateFormatter().string(from: Date())
    var nextAttemptAt: Date = Date.distantPast

    init(seq: Int, operation: SyncOperation) {
        let now = Date()
        let isoFormatter = ISO8601DateFormatter()
        id = UUID()
        self.seq = seq
        createdAt = now
        type = operation.typeName
        payload = LocalStoreCoding.encode(operation)
        affectedTable = operation.affectedTable
        affectedId = operation.affectedId
        retryCount = 0
        idempotencyKey = UUID().uuidString
        clientEditedAt = isoFormatter.string(from: now)
        nextAttemptAt = Date.distantPast
    }

    func operation() -> SyncOperation? {
        LocalStoreCoding.decode(SyncOperation.self, from: payload)
    }

    /// Rewrites the payload in place (temp-id coalescing and reference
    /// remapping after a create drained). The affected table/id are refreshed
    /// so coalescing lookups keep working after an op is re-keyed from a
    /// `temp_` id to its server id.
    /// The idempotencyKey is NOT changed — coalescing never changes the logical
    /// operation, only its body or affected id.
    func replaceOperation(_ operation: SyncOperation) {
        type = operation.typeName
        payload = LocalStoreCoding.encode(operation)
        affectedTable = operation.affectedTable
        affectedId = operation.affectedId
    }
}

extension PendingSyncOperation {
    /// Next FIFO sequence number for a new queue row (highest existing `seq` + 1,
    /// or 1 on an empty queue). `seq` has no uniqueness constraint — it's a sort
    /// hint, not row identity (`id: UUID` is that). Two processes racing this
    /// read-then-insert (the app and the widget extension enqueuing
    /// near-simultaneously) can compute the same value for two different rows;
    /// that's benign — the two ops just drain in either relative order, no worse
    /// than ops from two physical devices already are, and the server dedupes
    /// retries via `idempotencyKey` regardless.
    static func nextSeq(in context: ModelContext) -> Int {
        var descriptor = FetchDescriptor<PendingSyncOperation>(sortBy: [SortDescriptor(\.seq, order: .reverse)])
        descriptor.fetchLimit = 1
        return ((try? context.fetch(descriptor))?.first?.seq ?? 0) + 1
    }
}
