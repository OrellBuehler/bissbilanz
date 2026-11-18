@testable import Bissbilanz
import Foundation
import Testing

@Suite("Sign-in plan")
struct SignInPlanTests {
    @Test("A web provider is reused directly")
    func webProviderIsReused() {
        #expect(SignInPlan.resolve(lastProvider: "infomaniak", isLocalMode: false) == .web(.infomaniak))
        #expect(SignInPlan.resolve(lastProvider: "google", isLocalMode: false) == .web(.google))
    }

    @Test("Apple needs its native button, restricted to Apple")
    func appleUsesNativePrompt() {
        #expect(SignInPlan.resolve(lastProvider: "apple", isLocalMode: false) == .prompt(.apple))
    }

    @Test("No recorded provider asks the user to choose")
    func unknownProviderAsksToChoose() {
        #expect(SignInPlan.resolve(lastProvider: nil, isLocalMode: false) == .prompt(.choose))
    }

    @Test("An unrecognised provider asks the user to choose")
    func unrecognisedProviderAsksToChoose() {
        #expect(SignInPlan.resolve(lastProvider: "github", isLocalMode: false) == .prompt(.choose))
        #expect(SignInPlan.resolve(lastProvider: "", isLocalMode: false) == .prompt(.choose))
    }

    @Test("Local mode always asks, whatever was recorded")
    func localModeAlwaysAsks() {
        for provider in [nil, "infomaniak", "google", "apple"] {
            #expect(SignInPlan.resolve(lastProvider: provider, isLocalMode: true) == .prompt(.choose))
        }
    }
}

@Suite("Sign-in prompt")
struct SignInPromptTests {
    @Test("The choice lists the enabled web providers in display order")
    func chooseListsEnabledWebProviders() {
        #expect(SignInPrompt.choose.webProviders(enabled: ["google", "infomaniak"]) == [.infomaniak, .google])
        #expect(SignInPrompt.choose.webProviders(enabled: ["google"]) == [.google])
        #expect(SignInPrompt.choose.webProviders(enabled: ["apple"]).isEmpty)
        #expect(SignInPrompt.choose.webProviders(enabled: []).isEmpty)
    }

    @Test("The choice offers Apple only when the server enabled it")
    func chooseOffersAppleWhenEnabled() {
        #expect(SignInPrompt.choose.showsApple(enabled: ["infomaniak", "google", "apple"]))
        #expect(!SignInPrompt.choose.showsApple(enabled: ["infomaniak", "google"]))
    }

    @Test("The Apple prompt offers Apple and nothing else")
    func appleOffersOnlyApple() {
        #expect(SignInPrompt.apple.webProviders(enabled: ["infomaniak", "google", "apple"]).isEmpty)
        #expect(SignInPrompt.apple.showsApple(enabled: []))
    }

    @Test("Only the choice loads the server's provider list")
    func onlyChooseLoadsProviders() {
        #expect(SignInPrompt.choose.loadsEnabledProviders)
        #expect(!SignInPrompt.apple.loadsEnabledProviders)
    }

    @Test("Prompts have distinct identities")
    func promptIdentities() {
        #expect(SignInPrompt.choose.id != SignInPrompt.apple.id)
    }
}

private final class ProviderMemoryStorage: @unchecked Sendable {
    private let lock = NSLock()
    private var values: [String: String] = [:]

    init(access: String? = nil, refresh: String? = nil) {
        values[AuthManager.accessTokenKey] = access
        values[AuthManager.refreshTokenKey] = refresh
    }

    subscript(key: String) -> String? {
        get {
            lock.lock()
            defer { lock.unlock() }
            return values[key]
        }
        set {
            lock.lock()
            defer { lock.unlock() }
            values[key] = newValue
        }
    }

    var asStorage: AuthTokenStorage {
        AuthTokenStorage(
            load: { self[$0] },
            save: { self[$0] = $1 },
            delete: { self[$0] = nil }
        )
    }
}

@MainActor
private struct ProviderHarness {
    let baseURL: String
    let storage: ProviderMemoryStorage
    let auth: AuthManager

    init(access: String? = nil, refresh: String? = nil) {
        let baseURL = "https://stub-provider-\(UUID().uuidString.lowercased()).local"
        let storage = ProviderMemoryStorage(access: access, refresh: refresh)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        self.baseURL = baseURL
        self.storage = storage
        auth = AuthManager(
            baseURL: baseURL,
            session: URLSession(configuration: configuration),
            tokenStorage: storage.asStorage
        )
    }

    var tokenURL: String {
        "\(baseURL)/api/auth/mobile/token"
    }

    func stubTokens() {
        StubURLProtocol.stub(
            "POST", tokenURL,
            json: #"{"access_token":"new-access","refresh_token":"new-refresh","token_type":"Bearer","expires_in":3600}"#
        )
    }

    func signIn(provider: String) async throws -> Bool {
        try await complete(auth.buildLoginURL(provider: provider))
    }

    func signInWithDefaultProvider() async throws -> Bool {
        try await complete(auth.buildLoginURL())
    }

    private func complete(_ url: URL?) async throws -> Bool {
        let loginURL = try #require(url)
        let items = try #require(URLComponents(url: loginURL, resolvingAgainstBaseURL: false)?.queryItems)
        let state = try #require(items.first { $0.name == "state" }?.value)
        let callback = try #require(URL(string: "bissbilanz://callback?code=abc123&state=\(state)"))
        return await auth.handleCallback(url: callback)
    }
}

@Suite("AuthManager remembers the sign-in provider")
@MainActor
struct AuthManagerProviderTests {
    @Test("A fresh install has no provider")
    func freshInstallHasNone() {
        #expect(ProviderHarness().auth.lastProvider == nil)
    }

    @Test("A web sign-in records the provider it was started with")
    func webSignInRecordsProvider() async throws {
        let harness = ProviderHarness()
        harness.stubTokens()

        let signedIn = try await harness.signIn(provider: "google")

        #expect(signedIn)
        #expect(harness.auth.lastProvider == "google")
        #expect(harness.auth.authState == .authenticated)
        #expect(SignInPlan.resolve(lastProvider: harness.auth.lastProvider, isLocalMode: false) == .web(.google))
    }

    @Test("The default login URL records Infomaniak")
    func defaultProviderIsInfomaniak() async throws {
        let harness = ProviderHarness()
        harness.stubTokens()

        let signedIn = try await harness.signInWithDefaultProvider()

        #expect(signedIn)
        #expect(harness.auth.lastProvider == "infomaniak")
    }

    @Test("The latest login URL decides the recorded provider")
    func latestLoginURLWins() async throws {
        let harness = ProviderHarness()
        harness.stubTokens()
        _ = harness.auth.buildLoginURL(provider: "google")

        let signedIn = try await harness.signIn(provider: "infomaniak")

        #expect(signedIn)
        #expect(harness.auth.lastProvider == "infomaniak")
    }

    @Test("A rejected code exchange records nothing")
    func failedExchangeRecordsNothing() async throws {
        let harness = ProviderHarness()
        StubURLProtocol.stub("POST", harness.tokenURL, status: 400, json: #"{"error":"invalid"}"#)

        let signedIn = try await harness.signIn(provider: "google")

        #expect(!signedIn)
        #expect(harness.auth.lastProvider == nil)
        #expect(harness.auth.authState == .unauthenticated)
    }

    @Test("A callback with the wrong state records nothing")
    func wrongStateRecordsNothing() async throws {
        let harness = ProviderHarness()
        harness.stubTokens()
        _ = harness.auth.buildLoginURL(provider: "google")

        let callback = try #require(URL(string: "bissbilanz://callback?code=abc123&state=wrong"))
        let handled = await harness.auth.handleCallback(url: callback)

        #expect(!handled)
        #expect(harness.auth.lastProvider == nil)
    }

    @Test("Native Sign in with Apple records Apple")
    func appleSignInRecordsApple() async {
        let harness = ProviderHarness()
        StubURLProtocol.stub(
            "POST", "\(harness.baseURL)/api/auth/mobile/apple",
            json: #"{"access_token":"new-access","refresh_token":"new-refresh","token_type":"Bearer","expires_in":3600}"#
        )

        let signedIn = await harness.auth.signInWithApple(identityToken: "token", nonce: "nonce", name: nil)

        #expect(signedIn)
        #expect(harness.auth.lastProvider == "apple")
        #expect(SignInPlan.resolve(lastProvider: harness.auth.lastProvider, isLocalMode: false) == .prompt(.apple))
    }

    @Test("A rejected Apple sign-in records nothing")
    func rejectedAppleSignInRecordsNothing() async {
        let harness = ProviderHarness()
        StubURLProtocol.stub("POST", "\(harness.baseURL)/api/auth/mobile/apple", status: 401, json: #"{"message":"nope"}"#)

        let signedIn = await harness.auth.signInWithApple(identityToken: "token", nonce: "nonce", name: nil)

        #expect(!signedIn)
        #expect(harness.auth.lastProvider == nil)
    }

    @Test("Signing out forgets the provider")
    func logoutForgetsProvider() async throws {
        let harness = ProviderHarness()
        harness.stubTokens()
        _ = try await harness.signIn(provider: "google")

        harness.auth.logout()

        #expect(harness.auth.lastProvider == nil)
        #expect(harness.storage[AuthManager.providerKey] == nil)
    }

    @Test("A token refresh keeps the provider")
    func refreshKeepsProvider() async throws {
        let harness = ProviderHarness()
        harness.stubTokens()
        _ = try await harness.signIn(provider: "google")

        let refreshed = await harness.auth.refreshAccessToken()

        #expect(refreshed)
        #expect(harness.auth.lastProvider == "google")
    }

    @Test("A rejected refresh keeps the provider so re-sign-in reaches the same account")
    func expiredSessionKeepsProvider() async throws {
        let harness = ProviderHarness()
        harness.stubTokens()
        _ = try await harness.signIn(provider: "google")
        StubURLProtocol.stub("POST", harness.tokenURL, status: 401, json: #"{"message":"nope"}"#)

        let refreshed = await harness.auth.refreshAccessToken()

        #expect(!refreshed)
        #expect(harness.auth.authState == .expired)
        #expect(SignInPlan.resolve(lastProvider: harness.auth.lastProvider, isLocalMode: false) == .web(.google))
    }

    @Test("An install that never recorded a provider asks the user to choose")
    func legacyInstallAsksToChoose() {
        let harness = ProviderHarness(access: "old-access", refresh: "old-refresh")

        #expect(harness.auth.authState == .authenticated)
        #expect(SignInPlan.resolve(lastProvider: harness.auth.lastProvider, isLocalMode: false) == .prompt(.choose))
    }
}
