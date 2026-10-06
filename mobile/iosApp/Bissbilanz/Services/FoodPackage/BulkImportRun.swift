import Foundation
import Observation
import SwiftData

/// One bulk import as the import screen sees it: what it is doing, how far it is, how it ended.
/// The work itself is `BulkPackageImporter`; this holds the task and keeps what the screen
/// shows on the main actor.
@MainActor
@Observable
final class BulkImportRun {
    private(set) var progress: BulkImportProgress?
    private(set) var summary: BulkImportSummary?
    private(set) var failure: String?
    private(set) var wasStopped = false
    private(set) var isRunning = false

    @ObservationIgnored private var task: Task<Void, Never>?

    /// Starts the import. `prepare` runs first (in Synced mode: pulling the account's foods, so
    /// the duplicate check sees them); `finish` runs after a successful import with its summary,
    /// before the screen shows it; `cleanup` runs once however it ends — the place to release the
    /// file.
    func start(
        container: ModelContainer,
        fileURL: URL,
        info: BulkPackageInfo,
        destination: BulkImportDestination,
        prepare: @escaping @MainActor () async -> Void = {},
        finish: @escaping @MainActor (BulkImportSummary) async -> Void = { _ in },
        cleanup: @escaping @MainActor () -> Void = {}
    ) {
        guard !isRunning else { return }
        isRunning = true
        progress = BulkImportProgress(processed: 0, total: info.foodCount)
        summary = nil
        failure = nil
        wasStopped = false
        task = Task { [weak self] in
            defer { cleanup() }
            await prepare()
            do {
                let result = try await BulkPackageImporter.importPackage(
                    container: container,
                    fileURL: fileURL,
                    expectedFoods: info.foodCount,
                    destination: destination
                ) { progress in
                    Task { @MainActor in self?.progress = progress }
                }
                var complete = result
                complete.recipesIgnored = info.recipeCount
                await finish(complete)
                self?.summary = complete
            } catch is CancellationError {
                self?.markStopped()
            } catch let error as FoodPackageError {
                self?.failure = FoodPackageErrorText.message(for: error)
            } catch {
                ErrorReporter.capture(error, context: ["operation": "BulkImportRun"])
                self?.failure = L10n.foodPackageImportFailed
            }
            self?.isRunning = false
            self?.task = nil
        }
    }

    private func markStopped() {
        wasStopped = true
    }

    /// Stops after the batch in flight. What was added stays, and importing the file again
    /// skips it.
    func cancel() {
        task?.cancel()
    }
}
