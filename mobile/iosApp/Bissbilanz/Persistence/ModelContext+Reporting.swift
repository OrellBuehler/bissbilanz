import Foundation
import SwiftData

extension ModelContext {
    func saveReportingFailure(_ operation: String) {
        do {
            try save()
        } catch {
            ErrorReporter.capture(error, context: ["operation": operation, "reason": ErrorReporter.reason(for: error)])
        }
    }
}
