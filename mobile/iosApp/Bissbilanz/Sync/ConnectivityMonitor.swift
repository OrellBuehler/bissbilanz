import Foundation
import Network
import Observation

/// Publishes network reachability on the main actor via `NWPathMonitor`
/// running on a background queue. `start()` is called once at app startup;
/// tests skip it and set `isOnline` directly.
@MainActor
@Observable
final class ConnectivityMonitor {
    /// Optimistic default so the first drain attempt isn't blocked before the
    /// path monitor delivers its initial update.
    var isOnline = true {
        didSet {
            if isOnline != oldValue {
                onOnlineChange?(isOnline)
            }
        }
    }

    /// Invoked on the main actor whenever connectivity flips (used by the
    /// sync manager to drain when connectivity is regained).
    var onOnlineChange: ((Bool) -> Void)?

    @ObservationIgnored private var monitor: NWPathMonitor?

    func start() {
        guard monitor == nil else { return }
        let monitor = NWPathMonitor()
        // Weak: the handler is owned by the monitor, and the monitor is owned
        // by this instance, so a strong capture is a reference cycle. Harmless
        // while this lives for the app's lifetime, but it made the type
        // impossible to release in isolation (tests, previews, any future
        // non-singleton use).
        monitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            Task { @MainActor in
                self?.isOnline = online
            }
        }
        monitor.start(queue: DispatchQueue(label: "connectivity-monitor", qos: .utility))
        self.monitor = monitor
    }

    /// Stops the path monitor. `start()` can be called again afterwards.
    func stop() {
        monitor?.cancel()
        monitor = nil
    }
}
