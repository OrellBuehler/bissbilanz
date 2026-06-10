import Foundation
import SwiftData

/// One persisted row of the offline sync queue. Ordered FIFO by `seq`
/// (monotonically increasing, assigned at enqueue time on the main actor);
/// `createdAt` is informational. The `affectedTable`/`affectedId` columns make
/// temp-id coalescing lookups cheap without decoding every payload.
@Model
final class PendingSyncOperation {
    @Attribute(.unique) var id: UUID
    var seq: Int
    var createdAt: Date
    var type: String
    var payload: Data
    var affectedTable: String?
    var affectedId: String?
    var retryCount: Int

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
