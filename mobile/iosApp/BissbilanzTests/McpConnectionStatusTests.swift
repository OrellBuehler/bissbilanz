@testable import Bissbilanz
import Foundation
import Testing

@Suite("MCP connection status")
@MainActor
struct McpConnectionStatusTests {
    @Test("Starts disconnected with no cached value")
    func startsDisconnected() throws {
        let harness = try RepositoryHarness()
        let status = McpConnectionStatus(api: harness.api, appMode: harness.appMode, defaults: harness.defaults)
        #expect(status.isConnected == false)
    }

    @Test("Local mode never calls the server")
    func localModeSkipsRefresh() async throws {
        let harness = try RepositoryHarness(mode: .local)
        let status = McpConnectionStatus(api: harness.api, appMode: harness.appMode, defaults: harness.defaults)
        await status.refresh()
        #expect(harness.recordedRequests.isEmpty)
        #expect(status.isConnected == false)
    }

    @Test("Refresh picks up a connected assistant and caches it for the next launch")
    func refreshUpdatesAndCaches() async throws {
        let harness = try RepositoryHarness(mode: .synced)
        harness.stub("GET", "/api/mcp/status", json: #"{"connected": true}"#)
        let status = McpConnectionStatus(api: harness.api, appMode: harness.appMode, defaults: harness.defaults)
        await status.refresh()
        #expect(status.isConnected == true)

        let reloaded = McpConnectionStatus(api: harness.api, appMode: harness.appMode, defaults: harness.defaults)
        #expect(reloaded.isConnected == true)
    }

    @Test("A failed refresh keeps the last known value instead of resetting it")
    func failedRefreshKeepsLastValue() async throws {
        let harness = try RepositoryHarness(mode: .synced)
        harness.stub("GET", "/api/mcp/status", json: #"{"connected": true}"#)
        let status = McpConnectionStatus(api: harness.api, appMode: harness.appMode, defaults: harness.defaults)
        await status.refresh()
        #expect(status.isConnected == true)

        harness.stubError("GET", "/api/mcp/status", code: .notConnectedToInternet)
        await status.refresh()
        #expect(status.isConnected == true)
    }

    @Test("Starts with no client names when nothing is cached")
    func startsWithoutClientNames() throws {
        let harness = try RepositoryHarness()
        let status = McpConnectionStatus(api: harness.api, appMode: harness.appMode, defaults: harness.defaults)
        #expect(status.clientNames.isEmpty)
    }

    @Test("Refresh exposes the connected client names and caches them for the next launch")
    func refreshStoresClientNames() async throws {
        let harness = try RepositoryHarness(mode: .synced)
        harness.stub(
            "GET", "/api/mcp/status",
            json: #"{"connected": true, "clients": ["#
                + #"{"name": "Claude", "host": "claude.ai"}, {"name": "ChatGPT", "host": null}]}"#
        )
        let status = McpConnectionStatus(api: harness.api, appMode: harness.appMode, defaults: harness.defaults)
        await status.refresh()
        #expect(status.clientNames == ["Claude", "ChatGPT"])

        let reloaded = McpConnectionStatus(api: harness.api, appMode: harness.appMode, defaults: harness.defaults)
        #expect(reloaded.clientNames == ["Claude", "ChatGPT"])
    }

    @Test("An older server without clients still reports connected with no names")
    func refreshWithoutClientsField() async throws {
        let harness = try RepositoryHarness(mode: .synced)
        harness.stub("GET", "/api/mcp/status", json: #"{"connected": true}"#)
        let status = McpConnectionStatus(api: harness.api, appMode: harness.appMode, defaults: harness.defaults)
        await status.refresh()
        #expect(status.isConnected == true)
        #expect(status.clientNames.isEmpty)
    }

    @Test("Disconnecting clears the cached client names")
    func refreshClearsClientNames() async throws {
        let harness = try RepositoryHarness(mode: .synced)
        harness.stub(
            "GET", "/api/mcp/status",
            json: #"{"connected": true, "clients": [{"name": "Claude", "host": null}]}"#
        )
        let status = McpConnectionStatus(api: harness.api, appMode: harness.appMode, defaults: harness.defaults)
        await status.refresh()
        #expect(status.clientNames == ["Claude"])

        harness.stub("GET", "/api/mcp/status", json: #"{"connected": false, "clients": []}"#)
        await status.refresh()
        #expect(status.isConnected == false)
        #expect(status.clientNames.isEmpty)
    }

    @Test("A failed refresh keeps the last known client names")
    func failedRefreshKeepsClientNames() async throws {
        let harness = try RepositoryHarness(mode: .synced)
        harness.stub(
            "GET", "/api/mcp/status",
            json: #"{"connected": true, "clients": [{"name": "Claude", "host": null}]}"#
        )
        let status = McpConnectionStatus(api: harness.api, appMode: harness.appMode, defaults: harness.defaults)
        await status.refresh()

        harness.stubError("GET", "/api/mcp/status", code: .notConnectedToInternet)
        await status.refresh()
        #expect(status.clientNames == ["Claude"])
    }

    @Test("Display names are trimmed, deduplicated and drop blanks")
    func displayNames() {
        let names = McpConnectionStatus.displayNames(from: [
            McpStatusClient(name: "Claude", host: "claude.ai"),
            McpStatusClient(name: " Claude ", host: nil),
            McpStatusClient(name: "  ", host: nil),
            McpStatusClient(name: "ChatGPT", host: nil),
        ])
        #expect(names == ["Claude", "ChatGPT"])
        #expect(McpConnectionStatus.displayNames(from: nil).isEmpty)
    }

    @Test("Status response decodes with and without the clients field")
    func decodesStatusResponse() throws {
        let decoder = JSONDecoder()
        let withClients = try decoder.decode(
            McpStatusResponse.self,
            from: Data(#"{"connected": true, "clients": [{"name": "Claude", "host": null}]}"#.utf8)
        )
        #expect(withClients.connected == true)
        #expect(withClients.clients == [McpStatusClient(name: "Claude", host: nil)])

        let withoutClients = try decoder.decode(
            McpStatusResponse.self,
            from: Data(#"{"connected": false}"#.utf8)
        )
        #expect(withoutClients.connected == false)
        #expect(withoutClients.clients == nil)
    }
}
