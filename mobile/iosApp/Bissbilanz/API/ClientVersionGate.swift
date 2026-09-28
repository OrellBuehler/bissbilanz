import Foundation
import Observation

/// The headers every request to the Bissbilanz server (`/api/*`) must carry so
/// the server can enforce a minimum supported client version. Never sent to
/// any other host — Open Food Facts (`OpenFoodFactsClient`), a user-pasted
/// link (`AiTaskLinkExtractor`) — only to our own API.
///
/// Applied in exactly one place for most requests, `BissbilanzAPI.executeRequestData`,
/// since every method on that type funnels through it. `AuthManager` builds
/// four requests of its own (login providers, the two token exchanges, the
/// refresh) — those exist before there is any `BissbilanzAPI` instance to route
/// through, so they attach these headers themselves.
enum ClientVersionHeader {
    static let platform = "ios"

    /// `CFBundleShortVersionString` (MAJOR.MINOR.PATCH). Falls back to
    /// "0.0.0" if Info.plist is somehow missing it (never happens outside a
    /// broken build), so the header is always present and comparable rather
    /// than silently absent.
    static var current: String {
        (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "0.0.0"
    }

    static func apply(to request: inout URLRequest) {
        request.setValue(platform, forHTTPHeaderField: "X-Client-Platform")
        request.setValue(current, forHTTPHeaderField: "X-Client-Version")
    }

    /// Reads the server's minimum version off a 426 response: the
    /// `X-Client-Min-Version` header the contract guarantees, falling back to
    /// the JSON body's `minVersion` field in case something in between strips
    /// response headers.
    static func minVersion(from response: HTTPURLResponse, data: Data) -> String {
        if let header = response.value(forHTTPHeaderField: "X-Client-Min-Version"), !header.isEmpty {
            return header
        }
        struct Body: Decodable { let minVersion: String }
        return (try? JSONDecoder().decode(Body.self, from: data))?.minVersion ?? "unknown"
    }
}

/// Flips once when any request to the Bissbilanz server answers HTTP 426
/// (this build is older than the server's minimum supported version).
/// `BissbilanzAPI` and `AuthManager` both build requests to the server
/// directly and share one instance of this (constructed once in
/// `BissbilanzApp.init` and passed to both), so whichever call trips it first
/// puts up the same app-wide blocking screen (`UpdateRequiredView`).
///
/// Only ever moves from nil to set — there is no legitimate way back to "up
/// to date" short of actually updating and relaunching.
@MainActor
@Observable
final class UpdateRequiredGate {
    private(set) var minVersion: String?

    var isUpdateRequired: Bool { minVersion != nil }

    func flag(minVersion: String) {
        self.minVersion = minVersion
    }
}
