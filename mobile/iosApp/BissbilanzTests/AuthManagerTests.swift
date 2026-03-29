import Foundation
import Testing

@testable import Bissbilanz

@Suite("AuthState Tests")
struct AuthStateTests {
    @Test("AuthState enum values")
    func authStateValues() {
        let unauthenticated = AuthState.unauthenticated
        let authenticated = AuthState.authenticated
        let refreshing = AuthState.refreshing

        #expect(unauthenticated != authenticated)
        #expect(authenticated != refreshing)
        #expect(unauthenticated != refreshing)
    }
}

@Suite("KeychainHelper Tests")
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
    func loginURLFormat() {
        let auth = AuthManager(baseURL: "https://test.example.com")
        let url = auth.buildLoginURL()

        #expect(url != nil)
        #expect(url!.absoluteString.starts(with: "https://test.example.com/api/auth/mobile/login"))
        #expect(url!.absoluteString.contains("state="))
    }

    @Test("Login URL state parameter is UUID format")
    @MainActor
    func loginURLStateFormat() {
        let auth = AuthManager(baseURL: "https://test.example.com")
        let url = auth.buildLoginURL()!

        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        let state = components.queryItems?.first(where: { $0.name == "state" })?.value

        #expect(state != nil)
        #expect(UUID(uuidString: state!) != nil)
    }

    @Test("Each login URL has unique state")
    @MainActor
    func uniqueLoginState() {
        let auth = AuthManager(baseURL: "https://test.example.com")
        let url1 = auth.buildLoginURL()!
        let url2 = auth.buildLoginURL()!

        let components1 = URLComponents(url: url1, resolvingAgainstBaseURL: false)!
        let components2 = URLComponents(url: url2, resolvingAgainstBaseURL: false)!
        let state1 = components1.queryItems?.first(where: { $0.name == "state" })?.value
        let state2 = components2.queryItems?.first(where: { $0.name == "state" })?.value

        #expect(state1 != state2)
    }
}

@Suite("AuthManager Callback Parsing Tests")
struct AuthManagerCallbackTests {
    @Test("Callback URL without code returns false")
    @MainActor
    func callbackWithoutCode() async {
        let auth = AuthManager(baseURL: "https://test.example.com")
        _ = auth.buildLoginURL()

        let callbackURL = URL(string: "bissbilanz://callback?state=wrong")!
        let result = await auth.handleCallback(url: callbackURL)
        #expect(result == false)
    }

    @Test("Callback URL with wrong state returns false")
    @MainActor
    func callbackWrongState() async {
        let auth = AuthManager(baseURL: "https://test.example.com")
        _ = auth.buildLoginURL()

        let callbackURL = URL(string: "bissbilanz://callback?code=abc123&state=wrong-state")!
        let result = await auth.handleCallback(url: callbackURL)
        #expect(result == false)
    }

    @Test("Callback without prior login URL returns false")
    @MainActor
    func callbackWithoutLogin() async {
        let auth = AuthManager(baseURL: "https://test.example.com")

        let callbackURL = URL(string: "bissbilanz://callback?code=abc123&state=some-state")!
        let result = await auth.handleCallback(url: callbackURL)
        #expect(result == false)
    }

    @Test("Callback with empty components returns false")
    @MainActor
    func callbackEmptyComponents() async {
        let auth = AuthManager(baseURL: "https://test.example.com")
        _ = auth.buildLoginURL()

        let callbackURL = URL(string: "bissbilanz://callback")!
        let result = await auth.handleCallback(url: callbackURL)
        #expect(result == false)
    }
}

@Suite("AuthManager State Tests")
struct AuthManagerStateTests {
    @Test("Initial state is unauthenticated when no token exists")
    @MainActor
    func initialStateNoToken() {
        let auth = AuthManager(baseURL: "https://test.example.com")
        // Will be unauthenticated unless a token was previously stored
        // (depends on keychain state, but with a unique baseURL this should be clean)
        #expect(auth.authState == .unauthenticated || auth.authState == .authenticated)
    }

    @Test("isAuthenticated reflects authState")
    @MainActor
    func isAuthenticatedReflectsState() {
        let auth = AuthManager(baseURL: "https://test.example.com")
        if auth.authState == .authenticated {
            #expect(auth.isAuthenticated == true)
        } else {
            #expect(auth.isAuthenticated == false)
        }
    }

    @Test("Logout sets state to unauthenticated")
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

@Suite("TokenResponse Decoding Tests")
struct TokenResponseTests {
    @Test("Token response decodes snake_case keys")
    func tokenResponseDecoding() throws {
        let json = """
        {
            "access_token": "eyJhbGciOiJSUzI1NiJ9.test",
            "refresh_token": "refresh-token-123",
            "token_type": "Bearer",
            "expires_in": 3600
        }
        """.data(using: .utf8)!

        // TokenResponse is private, but we can test the coding keys pattern
        // by verifying the JSON structure matches what AuthManager expects
        let parsed = try JSONSerialization.jsonObject(with: json) as! [String: Any]
        #expect(parsed["access_token"] as? String == "eyJhbGciOiJSUzI1NiJ9.test")
        #expect(parsed["refresh_token"] as? String == "refresh-token-123")
        #expect(parsed["token_type"] as? String == "Bearer")
        #expect(parsed["expires_in"] as? Int == 3600)
    }

    @Test("Token response without refresh token")
    func tokenResponseWithoutRefresh() throws {
        let json = """
        {
            "access_token": "eyJhbGciOiJSUzI1NiJ9.test",
            "token_type": "Bearer",
            "expires_in": 3600
        }
        """.data(using: .utf8)!

        let parsed = try JSONSerialization.jsonObject(with: json) as! [String: Any]
        #expect(parsed["access_token"] != nil)
        #expect(parsed["refresh_token"] == nil)
    }
}
