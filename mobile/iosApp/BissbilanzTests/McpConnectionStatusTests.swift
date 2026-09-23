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
}
