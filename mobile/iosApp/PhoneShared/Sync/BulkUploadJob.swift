import Foundation
import SwiftData

/// One food of a bulk package import still to be uploaded to the account
/// (`POST /api/foods/bulk`). The food itself lives in `LocalFood` — usable the moment
/// the import wrote it — and this row only says it is not on the server yet, so a
/// hundred thousand of them are a hundred thousand small rows, not a queue of payloads.
///
/// Rows are keyed by `userId` as well as `foodId`: an upload only ever runs for the
/// account that imported, and a different account's rows are discarded, never sent.
/// A row is deleted once its food is on the server; `failed` rows stay for the user to
/// retry. Shares the store with the data models, so it is CloudKit-compatible like
/// them (no unique constraint, every attribute defaulted) although it is only written
/// in Synced mode.
@Model
final class BulkUploadJob {
    static let pendingState = "pending"
    static let failedState = "failed"

    var id: UUID = UUID()
    var userId: String = ""
    var foodId: String = ""
    var state: String = BulkUploadJob.pendingState
    var attempts: Int = 0
    var lastError: String?
    /// Higher goes first: a food the user logged before its upload is moved up so the
    /// entry that refers to it is not left waiting behind the rest of the package.
    var priority: Int = 0
    /// Set after the server reported the barcode as taken: the retry leaves it out.
    var dropBarcode: Bool = false
    var createdAt: Date = Date()

    init(userId: String, foodId: String) {
        id = UUID()
        self.userId = userId
        self.foodId = foodId
        state = Self.pendingState
        attempts = 0
        priority = 0
        dropBarcode = false
        createdAt = Date()
    }
}
