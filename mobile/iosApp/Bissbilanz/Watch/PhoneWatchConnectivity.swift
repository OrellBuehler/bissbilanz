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

    /// Performs the real write for an incoming log request and returns the
    /// refreshed snapshot to send back. Set by the app once its repositories
    /// exist. Runs on the main actor.
    @MainActor var onLogRequest: ((WatchLogRequest) async -> WidgetSnapshot?)?

    private var session: WCSession? {
        WCSession.isSupported() ? .default : nil
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
        guard let request = WatchPayloadCodec.decode(
            WatchLogRequest.self, from: message, key: WatchPayloadKey.logRequest
        )
        else {
            replyHandler([:])
            return
        }
        // `replyHandler` isn't Sendable; box it so the @MainActor task can call
        // it after the (async) write without an illegal cross-isolation capture.
        let reply = UncheckedSendable(replyHandler)
        Task { @MainActor in
            let snapshot = await onLogRequest?(request)
            let payload = snapshot.flatMap { WatchPayloadCodec.encode($0, key: WatchPayloadKey.snapshot) } ?? [:]
            reply.value(payload)
        }
    }

    /// Fallback path when the phone was unreachable: the watch logged
    /// optimistically and queued the request, which arrives here (FIFO) once the
    /// session reconnects. No reply channel — the next state push reconciles.
    func session(_: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        guard let request = WatchPayloadCodec.decode(
            WatchLogRequest.self, from: userInfo, key: WatchPayloadKey.logRequest
        )
        else { return }
        Task { @MainActor in
            _ = await onLogRequest?(request)
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
