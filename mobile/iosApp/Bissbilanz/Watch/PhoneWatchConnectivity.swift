import Foundation
import WatchConnectivity

/// Phone side of the iPhone ↔ Apple Watch link (Phase 1, dependent companion).
///
/// - **State (phone → watch):** the latest `WatchState` is pushed via
///   `updateApplicationContext` — latest-wins, delivered in the background and
///   retained by the system so a watch that reconnects gets the last state
///   automatically. Hooked into `WidgetSnapshotWriter`, the same place that
///   feeds the home-screen widgets.
/// - **Log (watch → phone):** the watch sends a `WatchLogRequest` via
///   `sendMessage` (with `transferUserInfo` as the guaranteed-FIFO fallback
///   when the phone isn't reachable). The phone performs the real write and,
///   for `sendMessage`, replies with the refreshed snapshot.
///
/// `WCSessionDelegate` callbacks arrive off the main thread, so every one hops
/// to the main actor before touching app state.
/// `@unchecked Sendable`: the only mutable state (`onLogRequest`) is
/// `@MainActor`-isolated and every delegate callback hops to the main actor
/// before touching it, so referencing the shared instance across isolation
/// domains is safe.
final class PhoneWatchConnectivity: NSObject, @unchecked Sendable {
    static let shared = PhoneWatchConnectivity()

    /// Performs the real write for an incoming food log request and returns the
    /// refreshed snapshot to send back. Set by the app once its repositories
    /// exist. Runs on the main actor.
    @MainActor var onLogRequest: ((WatchLogRequest) async -> WidgetSnapshot?)?

    /// Performs the real write for an incoming weight log and returns the
    /// refreshed `WatchState` (so the watch's Weight glance updates at once).
    @MainActor var onWeightLog: ((WatchWeightLogRequest) async -> WatchState?)?

    /// Performs the real write for an incoming sleep log and returns the
    /// refreshed `WatchState` (so the watch's Sleep glance updates at once).
    @MainActor var onSleepLog: ((WatchSleepLogRequest) async -> WatchState?)?

    private var session: WCSession? {
        WCSession.isSupported() ? .default : nil
    }

    private static let appliedRequestIdsKey = "watch_applied_request_ids_v1"
    private static let appliedRequestIdsLimit = 64

    /// Ids of watch requests already written, newest last.
    ///
    /// The watch re-sends via `transferUserInfo` whenever `sendMessage`'s error
    /// handler fires, and that handler can't distinguish "the phone never
    /// received this" from "the phone processed it but the reply was lost" — so
    /// on flaky connectivity the same log arrives twice. Persisted rather than
    /// held in memory because the queued copy can be delivered to a freshly
    /// launched process. Bounded; a request older than the last 64 is long
    /// past any retry window.
    @MainActor
    private func markApplied(_ requestId: String?) -> Bool {
        // An older watch build sends no id — nothing to dedup on, so apply as
        // before rather than dropping the log.
        guard let requestId else { return true }
        var applied = UserDefaults.standard.stringArray(forKey: Self.appliedRequestIdsKey) ?? []
        guard !applied.contains(requestId) else { return false }
        applied.append(requestId)
        if applied.count > Self.appliedRequestIdsLimit {
            applied.removeFirst(applied.count - Self.appliedRequestIdsLimit)
        }
        UserDefaults.standard.set(applied, forKey: Self.appliedRequestIdsKey)
        return true
    }

    override private init() {
        super.init()
    }

    /// Activates the session. Safe to call repeatedly and on devices without a
    /// paired watch (no-op when WatchConnectivity is unsupported).
    func activate() {
        guard let session else { return }
        session.delegate = self
        session.activate()
    }

    /// Pushes the latest state to the watch. No-op unless the session is active
    /// and a watch app is actually installed, so we never spend battery
    /// encoding for a watch that isn't there.
    func sendState(_ state: WatchState) {
        guard let session,
              session.activationState == .activated,
              session.isPaired,
              session.isWatchAppInstalled,
              let payload = WatchPayloadCodec.encode(state, key: WatchPayloadKey.state)
        else { return }
        try? session.updateApplicationContext(payload)
    }
}

extension PhoneWatchConnectivity: WCSessionDelegate {
    func session(_: WCSession, activationDidCompleteWith _: WCSessionActivationState, error _: Error?) {}

    /// The phone can pair with a different watch at runtime; the system tears
    /// the session down and we reactivate for the new device.
    func sessionDidBecomeInactive(_: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    // MARK: - Watch → phone log requests

    func session(
        _: WCSession,
        didReceiveMessage message: [String: Any],
        replyHandler: @escaping ([String: Any]) -> Void
    ) {
        // `replyHandler` isn't Sendable; box it so the @MainActor task can call
        // it after the (async) write without an illegal cross-isolation capture.
        let reply = UncheckedSendable(replyHandler)

        if let request = WatchPayloadCodec.decode(
            WatchLogRequest.self, from: message, key: WatchPayloadKey.logRequest
        ) {
            Task { @MainActor in
                // A repeat is acknowledged but not written again. The reply is
                // empty rather than a fresh snapshot: the first delivery
                // already ran the write, which pushed an application context,
                // so the watch is up to date either way.
                guard markApplied(request.requestId) else {
                    reply.value([:])
                    return
                }
                let snapshot = await onLogRequest?(request)
                let payload = snapshot.flatMap { WatchPayloadCodec.encode($0, key: WatchPayloadKey.snapshot) } ?? [:]
                reply.value(payload)
            }
        } else if let request = WatchPayloadCodec.decode(
            WatchWeightLogRequest.self, from: message, key: WatchPayloadKey.weightLogRequest
        ) {
            Task { @MainActor in
                guard markApplied(request.requestId) else {
                    reply.value([:])
                    return
                }
                let state = await onWeightLog?(request)
                reply.value(state.flatMap { WatchPayloadCodec.encode($0, key: WatchPayloadKey.state) } ?? [:])
            }
        } else if let request = WatchPayloadCodec.decode(
            WatchSleepLogRequest.self, from: message, key: WatchPayloadKey.sleepLogRequest
        ) {
            Task { @MainActor in
                guard markApplied(request.requestId) else {
                    reply.value([:])
                    return
                }
                let state = await onSleepLog?(request)
                reply.value(state.flatMap { WatchPayloadCodec.encode($0, key: WatchPayloadKey.state) } ?? [:])
            }
        } else {
            replyHandler([:])
        }
    }

    /// Fallback path when the phone was unreachable: the watch logged
    /// optimistically and queued the request, which arrives here (FIFO) once the
    /// session reconnects. No reply channel — the next state push reconciles.
    func session(_: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        if let request = WatchPayloadCodec.decode(
            WatchLogRequest.self, from: userInfo, key: WatchPayloadKey.logRequest
        ) {
            Task { @MainActor in
                guard markApplied(request.requestId) else { return }
                _ = await onLogRequest?(request)
            }
        } else if let request = WatchPayloadCodec.decode(
            WatchWeightLogRequest.self, from: userInfo, key: WatchPayloadKey.weightLogRequest
        ) {
            Task { @MainActor in
                guard markApplied(request.requestId) else { return }
                _ = await onWeightLog?(request)
            }
        } else if let request = WatchPayloadCodec.decode(
            WatchSleepLogRequest.self, from: userInfo, key: WatchPayloadKey.sleepLogRequest
        ) {
            Task { @MainActor in
                guard markApplied(request.requestId) else { return }
                _ = await onSleepLog?(request)
            }
        }
    }
}

/// Wraps a value the compiler can't prove `Sendable` (here, WatchConnectivity's
/// non-`Sendable` reply closure) so it can cross into a `@Sendable` task. Safe
/// because the wrapped closure is only ever invoked on the main actor.
private struct UncheckedSendable<Value>: @unchecked Sendable {
    let value: Value
    init(_ value: Value) {
        self.value = value
    }
}
