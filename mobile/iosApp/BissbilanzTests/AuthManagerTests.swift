@testable import Bissbilanz
import Foundation
import Testing

@Suite("AuthState Tests")
struct AuthStateTests {
    @Test("AuthState enum values")
    func authStateValues() {
        let unauthenticated = AuthState.unauthenticated
        let authenticated = AuthState.authenticated
        let refreshing = AuthState.refreshing
        let expired = AuthState.expired

        #expect(unauthenticated != authenticated)
        #expect(authenticated != refreshing)
        #expect(unauthenticated != refreshing)
        #expect(expired != unauthenticated)
        #expect(expired != authenticated)
    }
}

/// The keychain rejects unsigned processes: with the project default
/// `CODE_SIGNING_ALLOWED=NO`, `SecItemAdd` fails (missing entitlement) and
/// every save silently no-ops. Probe once and skip the suite in unsigned runs;
/// pass `CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-` to exercise it.
private let keychainIsAvailable: Bool = {
    let probeKey = "bissbilanz_test_probe_\(UUID().uuidString)"
    KeychainHelper.save(key: probeKey, value: "probe")
    defer { KeychainHelper.delete(key: probeKey) }
    return KeychainHelper.load(key: probeKey) == "probe"
}()

@Suite("KeychainHelper Tests", .enabled(if: keychainIsAvailable, "Keychain requires a signed test host"))
struct KeychainHelperTests {
    private let testKey = "bissbilanz_test_key_\(UUID().uuidString)"

    @Test("Save and load value from keychain")
    func saveAndLoad() {
        let value = "test-token-\(UUID().uuidString)"
        KeychainHelper.save(key: testKey, value: value)
        defer { KeychainHelper.delete(key: testKey) }

        let loaded = KeychainHelper.load(key: testKey)
        #expect(loaded == value)
    }

    @Test("Load returns nil for missing key")
    func loadMissing() {
        let loaded = KeychainHelper.load(key: "nonexistent_key_\(UUID().uuidString)")
        #expect(loaded == nil)
    }

    @Test("Delete removes value from keychain")
    func deleteValue() {
        KeychainHelper.save(key: testKey, value: "to-be-deleted")
        KeychainHelper.delete(key: testKey)

        let loaded = KeychainHelper.load(key: testKey)
        #expect(loaded == nil)
    }

    @Test("Save overwrites existing value")
    func saveOverwrites() {
        KeychainHelper.save(key: testKey, value: "first")
        KeychainHelper.save(key: testKey, value: "second")
        defer { KeychainHelper.delete(key: testKey) }

        let loaded = KeychainHelper.load(key: testKey)
        #expect(loaded == "second")
    }

    @Test("Delete non-existent key does not crash")
    func deleteNonExistent() {
        KeychainHelper.delete(key: "nonexistent_key_\(UUID().uuidString)")
    }

    @Test("Save empty string")
    func saveEmptyString() {
        KeychainHelper.save(key: testKey, value: "")
        defer { KeychainHelper.delete(key: testKey) }

        let loaded = KeychainHelper.load(key: testKey)
        #expect(loaded == "")
    }

    @Test("Save long value")
    func saveLongValue() {
        let longValue = String(repeating: "a", count: 10000)
        KeychainHelper.save(key: testKey, value: longValue)
        defer { KeychainHelper.delete(key: testKey) }

        let loaded = KeychainHelper.load(key: testKey)
        #expect(loaded == longValue)
    }

    @Test("Save value with special characters")
    func saveSpecialChars() {
        let value = "token/with+special=chars&more!@#$%"
        KeychainHelper.save(key: testKey, value: value)
        defer { KeychainHelper.delete(key: testKey) }

        let loaded = KeychainHelper.load(key: testKey)
        #expect(loaded == value)
    }
}

@Suite("AuthManager Login URL Tests")
struct AuthManagerLoginURLTests {
    @Test("Login URL contains base URL and state parameter")
    @MainActor
    func loginURLFormat() throws {
        let auth = AuthManager(baseURL: "https://test.example.com")
        let url = auth.buildLoginURL()

        #expect(url != nil)
        #expect(try #require(url?.absoluteString.starts(with: "https://test.example.com/api/auth/mobile/login")))
        #expect(try #require(url?.absoluteString.contains("state=")))
    }

    @Test("Login URL state parameter is UUID format")
    @MainActor
    func loginURLStateFormat() throws {
        let auth = AuthManager(baseURL: "https://test.example.com")
        let url = try #require(auth.buildLoginURL())

        let components = try #require(URLComponents(url: url, resolvingAgainstBaseURL: false))
        let state = components.queryItems?.first(where: { $0.name == "state" })?.value

        #expect(state != nil)
        #expect(try UUID(uuidString: #require(state)) != nil)
    }

    @Test("Each login URL has unique state")
    @MainActor
    func uniqueLoginState() throws {
        let auth = AuthManager(baseURL: "https://test.example.com")
        let url1 = try #require(auth.buildLoginURL())
        let url2 = try #require(auth.buildLoginURL())

        let components1 = try #require(URLComponents(url: url1, resolvingAgainstBaseURL: false))
        let components2 = try #require(URLComponents(url: url2, resolvingAgainstBaseURL: false))
        let state1 = components1.queryItems?.first(where: { $0.name == "state" })?.value
        let state2 = components2.queryItems?.first(where: { $0.name == "state" })?.value

        #expect(state1 != state2)
    }
}

@Suite("AuthManager PKCE Tests")
struct AuthManagerPKCETests {
    @Test("Challenge matches the RFC 7636 test vector")
    func rfcVector() {
        let challenge = AuthManager.codeChallenge(for: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")
        #expect(challenge == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
    }

    @Test("Verifier is 64 unreserved characters and unique")
    func verifierFormat() {
        let verifier = AuthManager.generateCodeVerifier()
        let allowed = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        #expect(verifier.count == 64)
        #expect(verifier.allSatisfy { allowed.contains($0) })
        #expect(verifier != AuthManager.generateCodeVerifier())
    }

    @Test("Login URL carries an S256 challenge")
    @MainActor
    func loginURLHasChallenge() throws {
        let auth = AuthManager(baseURL: "https://test.example.com")
        let url = try #require(auth.buildLoginURL())
        let items = try #require(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems)

        let challenge = try #require(items.first { $0.name == "code_challenge" }?.value)
        #expect(challenge.count == 43)
        #expect(!challenge.contains("="))
        #expect(items.first { $0.name == "code_challenge_method" }?.value == "S256")
    }

    @Test("Token request sends the verifier matching the login challenge")
    @MainActor
    func tokenRequestIncludesVerifier() async throws {
        let baseURL = "https://stub-auth-\(UUID().uuidString.lowercased()).local"
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        let auth = AuthManager(baseURL: baseURL, session: URLSession(configuration: configuration))
        let loginURL = try #require(auth.buildLoginURL())
        let items = try #require(URLComponents(url: loginURL, resolvingAgainstBaseURL: false)?.queryItems)
        let state = try #require(items.first { $0.name == "state" }?.value)
        let challenge = try #require(items.first { $0.name == "code_challenge" }?.value)
        StubURLProtocol.stub("POST", "\(baseURL)/api/auth/mobile/token", status: 400, json: #"{"error":"invalid"}"#)

        let callbackURL = try #require(URL(string: "bissbilanz://callback?code=abc123&state=\(state)"))
        _ = await auth.handleCallback(url: callbackURL)

        let sent = try #require(StubURLProtocol.recordedBodies("POST", "\(baseURL)/api/auth/mobile/token").first)
        let body = try #require(try JSONSerialization.jsonObject(with: sent) as? [String: String])
        #expect(body["code"] == "abc123")
        let verifier = try #require(body["code_verifier"])
        #expect(AuthManager.codeChallenge(for: verifier) == challenge)
    }
}

@Suite("AuthManager Callback Parsing Tests")
struct AuthManagerCallbackTests {
    @Test("Callback URL without code returns false")
    @MainActor
    func callbackWithoutCode() async throws {
        let auth = AuthManager(baseURL: "https://test.example.com")
        _ = auth.buildLoginURL()

        let callbackURL = try #require(URL(string: "bissbilanz://callback?state=wrong"))
        let result = await auth.handleCallback(url: callbackURL)
        #expect(result == false)
    }

    @Test("Callback URL with wrong state returns false")
    @MainActor
    func callbackWrongState() async throws {
        let auth = AuthManager(baseURL: "https://test.example.com")
        _ = auth.buildLoginURL()

        let callbackURL = try #require(URL(string: "bissbilanz://callback?code=abc123&state=wrong-state"))
        let result = await auth.handleCallback(url: callbackURL)
        #expect(result == false)
    }

    @Test("Callback without prior login URL returns false")
    @MainActor
    func callbackWithoutLogin() async throws {
        let auth = AuthManager(baseURL: "https://test.example.com")

        let callbackURL = try #require(URL(string: "bissbilanz://callback?code=abc123&state=some-state"))
        let result = await auth.handleCallback(url: callbackURL)
        #expect(result == false)
    }

    @Test("Callback with empty components returns false")
    @MainActor
    func callbackEmptyComponents() async throws {
        let auth = AuthManager(baseURL: "https://test.example.com")
        _ = auth.buildLoginURL()

        let callbackURL = try #require(URL(string: "bissbilanz://callback"))
        let result = await auth.handleCallback(url: callbackURL)
        #expect(result == false)
    }
}

@Suite("AuthManager State Tests")
struct AuthManagerStateTests {
    @Test("After logout, state is unauthenticated")
    @MainActor
    func logoutSetsState() {
        let auth = AuthManager(baseURL: "https://test.example.com")
        auth.logout()
        #expect(auth.authState == .unauthenticated)
        #expect(auth.isAuthenticated == false)
    }

    @Test("Logout clears access token")
    @MainActor
    func logoutClearsToken() {
        let auth = AuthManager(baseURL: "https://test.example.com")
        auth.logout()
        #expect(auth.accessToken == nil)
    }

    @Test("Refresh without refresh token sets unauthenticated")
    @MainActor
    func refreshWithoutToken() async {
        let auth = AuthManager(baseURL: "https://test.example.com")
        auth.logout()

        let result = await auth.refreshAccessToken()
        #expect(result == false)
        #expect(auth.authState == .unauthenticated)
    }
}

@Suite("AuthManager JWT sub extraction")
struct AuthManagerJWTTests {
    /// Builds an unsigned JWT (`header.payload.signature`) with the given
    /// payload, base64url-encoded the way real tokens are.
    private func makeJWT(payload: [String: Any]) throws -> String {
        func base64url(_ object: Any) throws -> String {
            let data = try JSONSerialization.data(withJSONObject: object)
            return data.base64EncodedString()
                .replacingOccurrences(of: "+", with: "-")
                .replacingOccurrences(of: "/", with: "_")
                .replacingOccurrences(of: "=", with: "")
        }
        let header = try base64url(["alg": "none", "typ": "JWT"])
        let body = try base64url(payload)
        return "\(header).\(body).signature"
    }

    @Test("Extracts sub from a valid token")
    func extractsSub() throws {
        let token = try makeJWT(payload: ["sub": "user-123", "name": "Test"])
        #expect(AuthManager.extractSub(fromJWT: token) == "user-123")
    }

    @Test("Handles base64url payloads needing padding restored")
    func handlesPadding() throws {
        // A sub whose encoding lands on a length that dropped '=' padding.
        let token = try makeJWT(payload: ["sub": "abcde"])
        #expect(AuthManager.extractSub(fromJWT: token) == "abcde")
    }

    @Test("Returns nil when sub claim is missing")
    func missingSub() throws {
        let token = try makeJWT(payload: ["name": "no-sub-here"])
        #expect(AuthManager.extractSub(fromJWT: token) == nil)
    }

    @Test("Returns nil for a malformed token")
    func malformedToken() {
        #expect(AuthManager.extractSub(fromJWT: "not-a-jwt") == nil)
        #expect(AuthManager.extractSub(fromJWT: "") == nil)
        #expect(AuthManager.extractSub(fromJWT: "only.two") == nil)
    }

    @Test("Returns nil when sub is not a string")
    func nonStringSub() throws {
        let token = try makeJWT(payload: ["sub": 42])
        #expect(AuthManager.extractSub(fromJWT: token) == nil)
    }
}
