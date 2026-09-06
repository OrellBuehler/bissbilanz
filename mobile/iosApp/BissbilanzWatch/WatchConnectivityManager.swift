import Foundation
import WatchConnectivity
import WidgetKit

/// Watch side of the iPhone ↔ Apple Watch link (Phase 1, dependent companion).
///
/// - **State (phone → watch):** received via `didReceiveApplicationContext`,
///   persisted into the watch's own App Group (`WatchStore`) so the complication
///   sees it too, and published for the live UI. The watch can also *ask* for it
///   (`requestState()`), since the phone otherwise only pushes when it happens
///   to write and a watch that missed the last push would sit on stale data.
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

    /// Shortest gap between two state requests. Foregrounding is user-driven
    /// and the reply is a full store read on the phone, so a burst of quick
    /// wrist raises must not turn into a burst of phone work.
    private static let stateRequestInterval: TimeInterval = 30

    /// When the last request was sent, for the throttle above.
    private var lastStateRequest: Date?

    /// True while a request is in flight, so the throttle can't be beaten by
    /// two requests landing in the same window.
    private var isRequestingState = false

    private var session: WCSession? {
        WCSession.isSupported() ? .default : nil
    }

    override init() {
        state = WatchStore.load() ?? .empty(on: Date())
        super.init()
    }

    func activate() {
        guard let session else { return }
        session.delegate = self
        session.activate()
    }

    /// Asks the phone for fresh state (mirrors Wear's `/bissbilanz/request-state`).
    /// Called on launch — from the activation callback, since `isReachable` is
    /// meaningless before the session is up — and on every foreground.
    ///
    /// Throttled and de-duplicated: the phone answers by reading its whole
    /// store, so this must stay cheap to call from a lifecycle hook.
    func requestState() {
        guard let session,
              session.activationState == .activated,
              !isRequestingState,
              Date().timeIntervalSince(lastStateRequest ?? .distantPast) >= Self.stateRequestInterval,
              let payload = WatchPayloadCodec.encode(WatchStateRequest(), key: WatchPayloadKey.stateRequest)
        else { return }

        lastStateRequest = Date()

        guard session.isReachable else {
            Self.queueStateRequest(payload, on: session)
            return
        }

        isRequestingState = true
        session.sendMessage(
            payload,
            replyHandler: { reply in
                // Decode off the Task so only the Sendable result crosses into
                // the main actor (the reply dict isn't Sendable).
                let state = WatchPayloadCodec.decode(WatchState.self, from: reply, key: WatchPayloadKey.state)
                Task { @MainActor in
                    self.isRequestingState = false
                    if let state { self.apply(state) }
                }
            },
            errorHandler: { _ in
                // Same race the log paths handle: reachability flipped between
                // the check and the send. Fall back to the guaranteed queue so
                // the refresh still happens once the phone is back.
                Self.queueStateRequest(payload, on: session)
                Task { @MainActor in self.isRequestingState = false }
            }
        )
    }

    /// Queues a state request for delivery when the phone comes back, unless
    /// one is already waiting. `transferUserInfo` is a persistent FIFO, so a
    /// watch left out of range would otherwise stack one request per
    /// foreground and dump them all on the phone at once on reconnect — and
    /// they are interchangeable anyway, since each is answered with whatever
    /// state is current at delivery.
    private nonisolated static func queueStateRequest(_ payload: [String: Any], on session: WCSession) {
        let alreadyQueued = session.outstandingUserInfoTransfers.contains {
            $0.userInfo[WatchPayloadKey.stateRequest] != nil
        }
        guard !alreadyQueued else { return }
        session.transferUserInfo(payload)
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

    /// Sends a weight log to the phone. Mirrors `log(_:)`: confirmed when the
    /// phone replies (and the refreshed state is applied), queued otherwise.
    func logWeight(_ request: WatchWeightLogRequest) async -> LogOutcome {
        await relayLog(request, key: WatchPayloadKey.weightLogRequest)
    }

    /// Sends a sleep log to the phone. See `logWeight(_:)`.
    func logSleep(_ request: WatchSleepLogRequest) async -> LogOutcome {
        await relayLog(request, key: WatchPayloadKey.sleepLogRequest)
    }

    /// Shared relay for weight/sleep logs. The phone replies with a refreshed
    /// `WatchState` so the glance updates immediately; the unreachable path
    /// queues the request (guaranteed FIFO) and the next state push reconciles.
    private func relayLog(_ request: some Encodable, key: String) async -> LogOutcome {
        guard let session,
              let payload = WatchPayloadCodec.encode(request, key: key)
        else { return .failed }

        guard session.isReachable else {
            session.transferUserInfo(payload)
            return .queued
        }

        return await withCheckedContinuation { continuation in
            session.sendMessage(
                payload,
                replyHandler: { reply in
                    let state = WatchPayloadCodec.decode(WatchState.self, from: reply, key: WatchPayloadKey.state)
                    Task { @MainActor in
                        if let state { self.apply(state) }
                    }
                    continuation.resume(returning: .confirmed)
                },
                errorHandler: { _ in
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

    /// Replaces just the snapshot (e.g. from a log reply), keeping every other
    /// synced field. Goes through `replacingSnapshot` rather than a memberwise
    /// init so fields added to `WatchState` later aren't dropped here.
    private func applySnapshot(_ snapshot: WidgetSnapshot) {
        apply(state.replacingSnapshot(snapshot))
    }
}

extension WatchConnectivityManager: WCSessionDelegate {
    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error _: Error?
    ) {
        // The system retains the last application context across launches;
        // apply whatever is already waiting once the session is up.
        let context = session.receivedApplicationContext
        let state = WatchPayloadCodec.decode(WatchState.self, from: context, key: WatchPayloadKey.state)
        let didActivate = activationState == .activated
        Task { @MainActor in
            if let state { self.apply(state) }
            // That retained context is only as fresh as the phone's last write,
            // so ask for the current one now the session can carry the answer.
            guard didActivate else { return }
            self.requestState()
        }
    }

    nonisolated func session(_: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        guard let state = WatchPayloadCodec.decode(
            WatchState.self, from: applicationContext, key: WatchPayloadKey.state
        )
        else { return }
        Task { @MainActor in self.apply(state) }
    }
}
