import ActivityKit
import Foundation
import Observation

/// Owns the running fast from the app side: session lifecycle in
/// `FastingSessionStore` (the canonical cross-process copy), the ActivityKit
/// Live Activity mirroring it, and the `isFastingDay` write-back on stop
/// (through `EntryRepository`, so it follows the same offline-first sync path
/// as the dashboard toggle).
///
/// The system auto-ends a Live Activity after ~8h, which every 16h+ fast
/// exceeds — the session in the store stays canonical, and `refresh()`
/// (called on every foreground activation) re-requests a fresh activity when
/// the fast is still running but its activity is gone. `refresh()` also picks
/// up ends performed outside the app UI (`EndFastIntent` on the lock screen).
@MainActor
@Observable
final class FastingTimerManager {
    private(set) var session: FastingSession?
    private(set) var history: [FastingSession] = []
    private let entryRepository: EntryRepository
    private let syncManager: SyncManager

    init(entryRepository: EntryRepository, syncManager: SyncManager) {
        self.entryRepository = entryRepository
        self.syncManager = syncManager
        session = FastingSessionStore.loadCurrent()
        history = FastingSessionStore.loadHistory()
    }

    var isFasting: Bool {
        session != nil
    }

    var liveActivitiesEnabled: Bool {
        ActivityAuthorizationInfo().areActivitiesEnabled
    }

    /// Starts a fast. `startedAt` defaults to now but may lie in the past for
    /// a fast that began before the user remembered to start the timer; a
    /// future start is clamped to now.
    func start(targetHours: Int, startedAt: Date = Date()) {
        guard session == nil else { return }
        let newSession = FastingSession(startedAt: min(startedAt, Date()), targetHours: targetHours)
        FastingSessionStore.saveCurrent(newSession)
        session = newSession
        startActivity(for: newSession)
    }

    func changeTarget(hours: Int) async {
        guard var current = session else { return }
        current.targetHours = hours
        await update(current)
    }

    /// Moves the running fast's start. `startDate` lives in the activity's
    /// `ContentState`, so the Live Activity re-bases through a plain update.
    func changeStart(_ startedAt: Date) async {
        guard var current = session else { return }
        current.startedAt = min(startedAt, Date())
        await update(current)
    }

    private func update(_ current: FastingSession) async {
        FastingSessionStore.saveCurrent(current)
        session = current
        let state = contentState(for: current)
        for activity in Activity<FastingActivityAttributes>.activities {
            await activity.update(ActivityContent(state: state, staleDate: nil))
        }
    }

    func stop() async {
        guard var current = session else { return }
        let endDate = Date()
        current.endedAt = endDate
        FastingSessionStore.appendToHistory(current)
        FastingSessionStore.clearCurrent()
        session = nil
        history = FastingSessionStore.loadHistory()
        await endAllActivities()
        upload(current)
        try? await entryRepository.setDayProperties(
            date: DateFormatting.isoString(from: endDate),
            isFastingDay: true
        )
    }

    /// Rewrites a finished fast's start, end or target. Ignored unless the
    /// range is still valid.
    func updateHistory(_ session: FastingSession) {
        guard let endedAt = session.endedAt, endedAt > session.startedAt else { return }
        FastingSessionStore.updateInHistory(session)
        history = FastingSessionStore.loadHistory()
        upload(session)
    }

    func deleteHistory(id: UUID) {
        FastingSessionStore.removeFromHistory(id: id)
        history = FastingSessionStore.loadHistory()
        syncManager.enqueue(.deleteFast(id: id.uuidString.lowercased()))
    }

    /// Finished fasts are their own synced resource so the web history can
    /// list them; `SyncManager.enqueue` is a no-op in Local mode.
    private func upload(_ session: FastingSession) {
        guard let body = session.upsertBody, let id = body.id else { return }
        syncManager.enqueue(.upsertFast(id: id, body: body))
    }

    /// Ends the running fast without leaving a trace — no history entry and
    /// no fasting-day mark. For fasts started by mistake or abandoned after
    /// a few minutes.
    func discard() async {
        guard session != nil else { return }
        FastingSessionStore.clearCurrent()
        session = nil
        await endAllActivities()
    }

    /// Reconciles app state with the store and the system on foreground: the
    /// lock-screen intent may have ended the fast while we weren't looking,
    /// or the system may have expired the activity mid-fast (~8h cap).
    func refresh() {
        session = FastingSessionStore.loadCurrent()
        history = FastingSessionStore.loadHistory()
        guard let session else {
            // No running fast — sweep up any activity the intent path didn't
            // manage to end (e.g. it was force-killed mid-perform).
            if !Activity<FastingActivityAttributes>.activities.isEmpty {
                Task { await endAllActivities() }
            }
            return
        }
        if Activity<FastingActivityAttributes>.activities.isEmpty {
            startActivity(for: session)
        }
    }

    private func startActivity(for session: FastingSession) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        let attributes = FastingActivityAttributes(
            startDate: session.startedAt,
            targetHours: session.targetHours
        )
        do {
            _ = try Activity.request(
                attributes: attributes,
                content: ActivityContent(state: contentState(for: session), staleDate: nil),
                pushType: nil
            )
        } catch {
            // The fast itself is unaffected — the in-app timer keeps running
            // from the store; only the lock-screen surface is missing.
            ErrorReporter.captureWarning(
                "Fasting Live Activity request failed",
                context: ["reason": String(describing: error)]
            )
        }
    }

    private func contentState(for session: FastingSession) -> FastingActivityAttributes.ContentState {
        FastingActivityAttributes.ContentState(
            startDate: session.startedAt,
            targetEndDate: session.targetEndDate
        )
    }

    private func endAllActivities() async {
        for activity in Activity<FastingActivityAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }
}
