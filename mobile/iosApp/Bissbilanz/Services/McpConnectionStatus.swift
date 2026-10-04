import Foundation
import Observation

/// Cached "does this account have an MCP client (e.g. Claude, ChatGPT)
/// connected" status, backing the "send to assistant" gate in `AIMealSheet` —
/// an `AiTask` only ever gets processed if such a client is connected — and
/// the "Connected: Claude, ChatGPT" line in `ConnectAssistantView`.
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
    private static let clientNamesKey = "mcp_client_names"

    private(set) var isConnected: Bool
    private(set) var clientNames: [String]

    init(api: BissbilanzAPI, appMode: AppModeManager, defaults: UserDefaults = .standard) {
        self.api = api
        self.appMode = appMode
        self.defaults = defaults
        isConnected = defaults.bool(forKey: Self.key)
        clientNames = defaults.stringArray(forKey: Self.clientNamesKey) ?? []
    }

    nonisolated static func displayNames(from clients: [McpStatusClient]?) -> [String] {
        var seen = Set<String>()
        var names: [String] = []
        for client in clients ?? [] {
            let name = client.name.trimmingCharacters(in: .whitespacesAndNewlines)
            if !name.isEmpty, seen.insert(name).inserted { names.append(name) }
        }
        return names
    }

    func refresh() async {
        guard !appMode.isLocal else { return }
        guard let status = try? await api.getMcpStatus() else { return }
        let names = Self.displayNames(from: status.clients)
        isConnected = status.connected
        clientNames = names
        defaults.set(status.connected, forKey: Self.key)
        defaults.set(names, forKey: Self.clientNamesKey)
    }
}
