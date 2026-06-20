import Foundation
import WatchConnectivity
import WidgetKit

/// Watch side of the iPhone ↔ Apple Watch link (Phase 1, dependent companion).
///
/// - **State (phone → watch):** received via `didReceiveApplicationContext`,
///   persisted into the watch's own App Group (`WatchStore`) so the complication
///   sees it too, and published for the live UI.
/// - **Log (watch → phone):** `sendMessage` when the phone is reachable (the
///   reply carries refreshed totals for instant ring updates); otherwise the
///   request is queued with `transferUserInfo` (guaranteed FIFO) and the UI
///   updates optimistically.
///
/// Delegate callbacks arrive off the main thread, so they are `nonisolated` and
/// hop to the main actor before touching published state.
@MainActor
@Observable
final class WatchConnectivityManager: NSObject {
    enum LogOutcome {
        /// The phone confirmed the write (reply received).
        case confirmed
        /// The phone was unreachable; the request was queued for delivery.
        case queued
        /// WatchConnectivity is unavailable — nothing was sent.
        case failed
    }

    /// Latest known today-state. Seeded from the App Group so the UI has
    /// something to show before the first sync of the session arrives.
    private(set) var state: WatchState

    private var session: WCSession? {
        WCSession.isSupported() ? .default : nil
    }

    override init() {
        state = WatchStore.load() ?? .placeholder
        super.init()
    }

    func activate() {
        guard let session else { return }
        session.delegate = self
        session.activate()
    }

    /// Sends a log request to the phone. Returns once the phone replies
    /// (`.confirmed`) or the request has been queued for later delivery
    /// (`.queued`).
    func log(_ request: WatchLogRequest) async -> LogOutcome {
        guard let session,
              let payload = WatchPayloadCodec.encode(request, key: WatchPayloadKey.logRequest)
        else { return .failed }

        guard session.isReachable else {
            session.transferUserInfo(payload)
            return .queued
        }

        return await withCheckedContinuation { continuation in
            session.sendMessage(
                payload,
                replyHandler: { reply in
                    // Decode off the Task so only the Sendable result crosses
                    // into the main actor (the reply dict isn't Sendable).
                    let snapshot = WatchPayloadCodec.decode(
                        WidgetSnapshot.self, from: reply, key: WatchPayloadKey.snapshot
                    )
                    Task { @MainActor in
                        if let snapshot { self.applySnapshot(snapshot) }
                    }
                    continuation.resume(returning: .confirmed)
                },
                errorHandler: { _ in
                    // The reachability check raced with the phone backgrounding —
                    // fall back to the guaranteed queue so the log isn't lost.
                    session.transferUserInfo(payload)
                    continuation.resume(returning: .queued)
                }
            )
        }
    }

    // MARK: - State application (main actor)

    private func apply(_ state: WatchState) {
        self.state = state
        WatchStore.save(state)
        WidgetCenter.shared.reloadAllTimelines()
    }

    /// Replaces just the snapshot (e.g. from a log reply) while keeping the
    /// synced meal-type and recents lists.
    private func applySnapshot(_ snapshot: WidgetSnapshot) {
        apply(WatchState(snapshot: snapshot, mealTypes: state.mealTypes, recents: state.recents))
    }
}

extension WatchConnectivityManager: WCSessionDelegate {
    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith _: WCSessionActivationState,
        error _: Error?
    ) {
        // The system retains the last application context across launches;
        // apply whatever is already waiting once the session is up.
        let context = session.receivedApplicationContext
        guard let state = WatchPayloadCodec.decode(WatchState.self, from: context, key: WatchPayloadKey.state)
        else { return }
        Task { @MainActor in self.apply(state) }
    }

    nonisolated func session(_: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        guard let state = WatchPayloadCodec.decode(
            WatchState.self, from: applicationContext, key: WatchPayloadKey.state
        )
        else { return }
        Task { @MainActor in self.apply(state) }
    }
}
