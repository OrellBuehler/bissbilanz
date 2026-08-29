import BackgroundTasks
import Foundation
import SwiftData

/// Periodic background pull via `BGAppRefreshTask`, so changes made on the
/// server while the app is closed — MCP agent logs, edits from other devices —
/// reach the local store and the home/lock-screen widgets without waiting for
/// the next foreground. Without it the widgets only ever re-read the on-disk
/// snapshot, which no one updates while the app isn't running.
///
/// iOS decides the actual cadence (best-effort, typically a handful of runs a
/// day for a daily-used app; requires Background App Refresh enabled, pauses
/// in Low Power Mode, and stops entirely after a force-quit until the next
/// manual launch). Each run drains queued uploads, pulls what the widget
/// snapshot and watch state render, then publishes the snapshot — which also
/// reloads every widget timeline and pushes the refreshed state to the watch.
@MainActor
enum BackgroundRefresher {
    /// Must be listed under `BGTaskSchedulerPermittedIdentifiers` in project.yml.
    static let taskIdentifier = "com.bissbilanz.ios.refresh"

    struct Dependencies {
        let context: ModelContext
        let syncManager: SyncManager
        let entryRepository: EntryRepository
        let goalsRepository: GoalsRepository
        let weightRepository: WeightRepository
        let sleepRepository: SleepRepository
        let foodRepository: FoodRepository
        let supplementRepository: SupplementRepository
        let aiTaskStore: AiTaskStore
    }

    private static var dependencies: Dependencies?

    /// Registers the launch handler and arms the first request. Must run
    /// before the app finishes launching (BissbilanzApp.init) — the system
    /// rejects handlers registered later. Registering also covers background
    /// launches (widget intent, watch message) that never reach `.background`
    /// via scenePhase, so the chain can't go dead between foregrounds.
    static func register(_ deps: Dependencies) {
        dependencies = deps
        let registered = BGTaskScheduler.shared.register(
            forTaskWithIdentifier: taskIdentifier,
            using: .main
        ) { task in
            MainActor.assumeIsolated {
                handle(task)
            }
        }
        if !registered {
            // Only fails when the identifier is missing from
            // BGTaskSchedulerPermittedIdentifiers — a build misconfiguration
            // that silently kills all background refresh.
            ErrorReporter.captureWarning(
                "BGTask registration failed",
                context: ["task.identifier": taskIdentifier]
            )
        }
        schedule()
    }

    /// Requests the next background run. Safe to call repeatedly — submitting
    /// replaces the pending request for the same identifier. The date is an
    /// "earliest", not a schedule; iOS picks the actual run time. Submit
    /// throws (ignored) in the simulator, which has no background refresh.
    static func schedule() {
        let request = BGAppRefreshTaskRequest(identifier: taskIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    private static func handle(_ task: BGTask) {
        // Re-arm first so the chain survives a crash or expiry mid-run.
        schedule()
        guard let deps = dependencies else {
            task.setTaskCompleted(success: false)
            return
        }
        ErrorReporter.addBreadcrumb("background refresh", category: "sync")
        let work = Task {
            await pull(deps)
            // Publish even after a partial pull — whatever did land is newer
            // than what the widgets currently show.
            WidgetSnapshotWriter.write(context: deps.context)
            task.setTaskCompleted(success: !Task.isCancelled)
        }
        task.expirationHandler = {
            work.cancel()
        }
    }

    /// One pull cycle, separated from the BGTask plumbing for testability.
    /// Queued writes upload first so the pull can't resurrect state a queued
    /// edit supersedes. The pulls cover exactly what the widget snapshot and
    /// watch state render: today's log, goals, weight, sleep, favorites. Each
    /// step is independent — one failing (offline, expired session) must not
    /// stop the rest — and all of them no-op in Local mode.
    static func pull(_ deps: Dependencies) async {
        await deps.syncManager.drainPendingQueue()
        try? await deps.entryRepository.refresh(date: DateFormatting.today)
        try? await deps.goalsRepository.refresh()
        try? await deps.weightRepository.refresh()
        try? await deps.sleepRepository.refresh()
        try? await deps.foodRepository.refreshFavorites()
        // Not widget data: supplements are pulled so the reminder refill below sees
        // schedule and reminder-time edits made on another device. A background run is
        // one of the few chances iOS gives us to top the rolling window back up — a
        // delivered-but-untouched notification does not wake the app.
        try? await deps.supplementRepository.refresh()
        await SupplementReminderScheduler.refill(repository: deps.supplementRepository)
        // Not widget data either: a dismissed AI task means a meal the user asked the
        // assistant to log never got logged, and with no push channel a background pull
        // is the only way they hear about it before opening the app.
        try? await deps.aiTaskStore.refresh()
        await AiTaskNotifier.notifyNewDismissals(deps.aiTaskStore.tasks)
    }
}
