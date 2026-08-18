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
    private let entryRepository: EntryRepository

    init(entryRepository: EntryRepository) {
        self.entryRepository = entryRepository
        session = FastingSessionStore.loadCurrent()
    }

    var isFasting: Bool {
        session != nil
    }

    var liveActivitiesEnabled: Bool {
        ActivityAuthorizationInfo().areActivitiesEnabled
    }

    func start(targetHours: Int) {
        guard session == nil else { return }
        let newSession = FastingSession(startedAt: Date(), targetHours: targetHours)
        FastingSessionStore.saveCurrent(newSession)
        session = newSession
        startActivity(for: newSession)
    }

    func changeTarget(hours: Int) async {
        guard var current = session else { return }
        current.targetHours = hours
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
        await endAllActivities()
        try? await entryRepository.setDayProperties(
            date: DateFormatting.isoString(from: endDate),
            isFastingDay: true
        )
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
