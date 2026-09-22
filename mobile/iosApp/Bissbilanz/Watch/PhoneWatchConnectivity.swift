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
    /// exist. Runs on the main actor. Throws when the write did not happen, so
    /// the watch is told instead of reporting a log that doesn't exist.
    @MainActor var onLogRequest: ((WatchLogRequest) async throws -> WidgetSnapshot?)?

    /// Performs the real write for an incoming weight log and returns the
    /// refreshed `WatchState` (so the watch's Weight glance updates at once).
    @MainActor var onWeightLog: ((WatchWeightLogRequest) async throws -> WatchState?)?

    /// Performs the real write for an incoming sleep log and returns the
    /// refreshed `WatchState` (so the watch's Sleep glance updates at once).
    @MainActor var onSleepLog: ((WatchSleepLogRequest) async throws -> WatchState?)?

    /// Builds the current `WatchState` for a watch that asked for one. No
    /// write involved — the watch launched or came to the foreground and wants
    /// to know it isn't showing state from before the phone's last change.
    @MainActor var onStateRequest: (() async -> WatchState?)?

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

    /// Gives a claimed id back after its write failed. The claim is taken
    /// before the write so two deliveries can't both write; left in place, it
    /// would make any later retry of a log that never happened look like a
    /// duplicate.
    @MainActor
    private func releaseApplied(_ requestId: String?) {
        guard let requestId else { return }
        var applied = UserDefaults.standard.stringArray(forKey: Self.appliedRequestIdsKey) ?? []
        guard let index = applied.lastIndex(of: requestId) else { return }
        applied.remove(at: index)
        UserDefaults.standard.set(applied, forKey: Self.appliedRequestIdsKey)
    }

    /// Claims `requestId`, runs `write` and answers with its reply payload.
    ///
    /// A repeat is acknowledged but not written again; the reply is empty
    /// rather than fresh state because the first delivery already ran the
    /// write, which pushed an application context. A write that throws hands
    /// the id back, is reported, and answers with `WatchPayloadKey.error` so
    /// the watch says the log failed rather than that it landed.
    @MainActor
    private func applyWrite(
        requestId: String?,
        kind: String,
        _ write: () async throws -> [String: Any]
    ) async -> [String: Any] {
        guard markApplied(requestId) else { return [:] }
        do {
            return try await write()
        } catch {
            releaseApplied(requestId)
            ErrorReporter.capture(error, context: ["watchRequest": kind])
            return [WatchPayloadKey.error: true]
        }
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
                let payload = await applyWrite(requestId: request.requestId, kind: "food") {
                    let snapshot = try await onLogRequest?(request)
                    return snapshot.flatMap { WatchPayloadCodec.encode($0, key: WatchPayloadKey.snapshot) } ?? [:]
                }
                reply.value(payload)
            }
        } else if let request = WatchPayloadCodec.decode(
            WatchWeightLogRequest.self, from: message, key: WatchPayloadKey.weightLogRequest
        ) {
            Task { @MainActor in
                let payload = await applyWrite(requestId: request.requestId, kind: "weight") {
                    let state = try await onWeightLog?(request)
                    return state.flatMap { WatchPayloadCodec.encode($0, key: WatchPayloadKey.state) } ?? [:]
                }
                reply.value(payload)
            }
        } else if let request = WatchPayloadCodec.decode(
            WatchSleepLogRequest.self, from: message, key: WatchPayloadKey.sleepLogRequest
        ) {
            Task { @MainActor in
                let payload = await applyWrite(requestId: request.requestId, kind: "sleep") {
                    let state = try await onSleepLog?(request)
                    return state.flatMap { WatchPayloadCodec.encode($0, key: WatchPayloadKey.state) } ?? [:]
                }
                reply.value(payload)
            }
        } else if WatchPayloadCodec.decode(
            WatchStateRequest.self, from: message, key: WatchPayloadKey.stateRequest
        ) != nil {
            // Idempotent and carries no id, so it deliberately skips the
            // applied-request dedup the log paths run through.
            Task { @MainActor in
                let state = await onStateRequest?()
                reply.value(state.flatMap { WatchPayloadCodec.encode($0, key: WatchPayloadKey.state) } ?? [:])
            }
        } else {
            replyHandler([:])
        }
    }

    /// Fallback path when the phone was unreachable: the watch queued the
    /// request, which arrives here (FIFO) once the session reconnects. No
    /// reply channel — the next state push reconciles, and a failed write is
    /// reported and its id handed back so a later re-send can still apply.
    func session(_: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        if let request = WatchPayloadCodec.decode(
            WatchLogRequest.self, from: userInfo, key: WatchPayloadKey.logRequest
        ) {
            Task { @MainActor in
                _ = await applyWrite(requestId: request.requestId, kind: "food") {
                    _ = try await onLogRequest?(request)
                    return [:]
                }
            }
        } else if let request = WatchPayloadCodec.decode(
            WatchWeightLogRequest.self, from: userInfo, key: WatchPayloadKey.weightLogRequest
        ) {
            Task { @MainActor in
                _ = await applyWrite(requestId: request.requestId, kind: "weight") {
                    _ = try await onWeightLog?(request)
                    return [:]
                }
            }
        } else if let request = WatchPayloadCodec.decode(
            WatchSleepLogRequest.self, from: userInfo, key: WatchPayloadKey.sleepLogRequest
        ) {
            Task { @MainActor in
                _ = await applyWrite(requestId: request.requestId, kind: "sleep") {
                    _ = try await onSleepLog?(request)
                    return [:]
                }
            }
        } else if WatchPayloadCodec.decode(
            WatchStateRequest.self, from: userInfo, key: WatchPayloadKey.stateRequest
        ) != nil {
            // Queued while the phone was unreachable, so there's no reply
            // channel to answer on — push the state instead, which is what the
            // watch would have got from the message reply.
            Task { @MainActor in
                guard let state = await onStateRequest?() else { return }
                sendState(state)
            }
        }
    }
}

/// A watch request the phone refuses to write because the server would reject
/// the entry on upload.
enum WatchRequestError: Error {
    case invalidSleepDuration(Int)
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
