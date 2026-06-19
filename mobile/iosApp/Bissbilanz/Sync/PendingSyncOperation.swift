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

    init(seq: Int, operation: SyncOperation) {
        id = UUID()
        self.seq = seq
        createdAt = Date()
        type = operation.typeName
        payload = LocalStoreCoding.encode(operation)
        affectedTable = operation.affectedTable
        affectedId = operation.affectedId
        retryCount = 0
    }

    func operation() -> SyncOperation? {
        LocalStoreCoding.decode(SyncOperation.self, from: payload)
    }

    /// Rewrites the payload in place (temp-id coalescing and reference
    /// remapping after a create drained). The affected table/id are refreshed
    /// so coalescing lookups keep working after an op is re-keyed from a
    /// `temp_` id to its server id.
    func replaceOperation(_ operation: SyncOperation) {
        type = operation.typeName
        payload = LocalStoreCoding.encode(operation)
        affectedTable = operation.affectedTable
        affectedId = operation.affectedId
    }
}
