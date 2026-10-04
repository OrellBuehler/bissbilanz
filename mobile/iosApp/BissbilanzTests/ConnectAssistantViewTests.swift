@testable import Bissbilanz
import Foundation
import Testing
import UIKit

@Suite("Connect assistant view")
struct ConnectAssistantViewTests {
    private let serverURL = "https://bissbilanz.orellbuehler.ch/api/mcp"

    @Test("Claude install link prefills the add-connector dialog with the encoded server URL")
    func claudeInstallURL() {
        let url = ConnectAssistantView.claudeInstallURL(serverURL: serverURL, directoryListingURL: nil)
        let expected = "https://claude.ai/customize/connectors?modal=add-custom-connector"
            + "&connectorName=Bissbilanz"
            + "&connectorUrl=https%3A%2F%2Fbissbilanz.orellbuehler.ch%2Fapi%2Fmcp"
        #expect(url.absoluteString == expected)
    }

    @Test("The encoded server URL round-trips through the query")
    func claudeInstallURLRoundTrips() throws {
        let url = ConnectAssistantView.claudeInstallURL(serverURL: serverURL, directoryListingURL: nil)
        let items = try #require(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems)
        let connectorUrl = items.first { $0.name == "connectorUrl" }?.value
        #expect(connectorUrl == serverURL)
    }

    @Test("A directory listing URL wins over the prefilled link")
    func directoryListingWins() throws {
        let listing = try #require(URL(string: "https://claude.ai/directory/connectors/bissbilanz"))
        let url = ConnectAssistantView.claudeInstallURL(serverURL: serverURL, directoryListingURL: listing)
        #expect(url == listing)
    }

    @Test("The default install link opens on claude.ai")
    func defaultInstallLinkHost() {
        #expect(ConnectAssistantView.claudeInstallURL().host == "claude.ai")
    }

    @Test("Server URL points at the MCP endpoint of the default base URL")
    func serverURLMatchesBase() {
        #expect(ConnectAssistantView.serverURL == "\(BissbilanzAPI.defaultBaseURL)/api/mcp")
    }

    @Test("QR code renders a square bitmap")
    func qrCodeImage() throws {
        let image = try #require(ConnectAssistantView.qrCodeImage(for: serverURL))
        #expect(image.size.width > 0)
        #expect(image.size.width == image.size.height)
    }
}
