import BackgroundTasks
import Foundation

/// Lets the bulk food upload carry on while the app is closed, as a `BGProcessingTask`:
/// iOS runs it when the device is idle and online, for minutes at a time, which is what a
/// package of tens of thousands of foods needs and a `BGAppRefreshTask` (seconds) cannot give.
/// Each run is `BulkUploadManager.drain`; when it expires the drain is cancelled between two
/// requests, loses nothing, and the next run carries on. A background `URLSession` is out of
/// scope: the requests are built and answered while the task runs.
@MainActor
enum BulkUploadScheduler {
    /// Must be listed under `BGTaskSchedulerPermittedIdentifiers` in project.yml.
    static let taskIdentifier = "com.bissbilanz.ios.bulkupload"

    private static var manager: BulkUploadManager?

    /// Registers the launch handler. Must run before the app finishes launching
    /// (`BissbilanzApp.init`), like `BackgroundRefresher.register`.
    static func register(_ manager: BulkUploadManager) {
        self.manager = manager
        let registered = BGTaskScheduler.shared.register(
            forTaskWithIdentifier: taskIdentifier,
            using: .main
        ) { task in
            MainActor.assumeIsolated {
                handle(task)
            }
        }
        if !registered {
            ErrorReporter.captureWarning(
                "BGTask registration failed",
                context: ["task.identifier": taskIdentifier]
            )
        }
    }

    /// Asks iOS for a run, when there is something to upload and the user has not paused it.
    /// Submitting again replaces the pending request. The date is an "earliest", not a
    /// schedule.
    static func schedule() {
        guard let manager, manager.pendingCount > 0, !manager.isPaused else { return }
        let request = BGProcessingTaskRequest(identifier: taskIdentifier)
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = false
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            // `BGTaskSchedulerErrorCodeUnavailable`: the simulator, or Background App
            // Refresh switched off. There is nothing to schedule then, and nothing to report.
            let nsError = error as NSError
            if nsError.domain == "BGTaskSchedulerErrorDomain", nsError.code == 1 { return }
            ErrorReporter.captureWarning(
                "Scheduling the bulk upload task failed", context: ["reason": ErrorReporter.reason(for: error)]
            )
        }
    }

    private static func handle(_ task: BGTask) {
        // Re-arm first so the chain survives a crash or expiry mid-run.
        schedule()
        guard let manager else {
            task.setTaskCompleted(success: false)
            return
        }
        ErrorReporter.addBreadcrumb("bulk upload task", category: "sync")
        let work = Task {
            await manager.drain()
            task.setTaskCompleted(success: !Task.isCancelled)
        }
        task.expirationHandler = {
            work.cancel()
        }
    }
}
