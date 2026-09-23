import Foundation
import Observation

/// Cached "does this account have an MCP client (e.g. Claude.ai, Claude Code)
/// connected" status, backing the "send to assistant" gate in `AIMealSheet` —
/// an `AiTask` only ever gets processed if such a client is connected.
///
/// Local (anonymous) mode has no server at all, so `refresh()` is a no-op
/// there; the "send to assistant" action is hidden entirely for Local mode by
/// the sheet, regardless of this value.
///
/// Offline-first: the last known value is cached to `UserDefaults` and read
/// back immediately at init, so opening the sheet never blocks on a network
/// call. `refresh()` updates it in the background; a failed refresh just
/// leaves the last known value (defaulting to "not connected") in place.
@MainActor
@Observable
final class McpConnectionStatus {
    private let api: BissbilanzAPI
    private let appMode: AppModeManager
    private let defaults: UserDefaults
    private static let key = "mcp_connected"

    private(set) var isConnected: Bool

    init(api: BissbilanzAPI, appMode: AppModeManager, defaults: UserDefaults = .standard) {
        self.api = api
        self.appMode = appMode
        self.defaults = defaults
        isConnected = defaults.bool(forKey: Self.key)
    }

    func refresh() async {
        guard !appMode.isLocal else { return }
        guard let connected = try? await api.getMcpStatus() else { return }
        isConnected = connected
        defaults.set(connected, forKey: Self.key)
    }
}
