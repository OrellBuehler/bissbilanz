@testable import Bissbilanz
import Foundation
import Testing

private final class MemoryTokenStorage: @unchecked Sendable {
    private let lock = NSLock()
    private var values: [String: String] = [:]

    init(access: String?, refresh: String?) {
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

private final class TestClock: @unchecked Sendable {
    private(set) var date = Date(timeIntervalSince1970: 1_800_000_000)

    func advance(_ seconds: TimeInterval) {
        date = date.addingTimeInterval(seconds)
    }
}

@MainActor
private struct AuthHarness {
    let baseURL: String
    let storage: MemoryTokenStorage
    let clock: TestClock
    let auth: AuthManager
    let api: BissbilanzAPI

    init(access: String? = "old-access", refresh: String? = "old-refresh") {
        let baseURL = "https://stub-auth-\(UUID().uuidString.lowercased()).local"
        let storage = MemoryTokenStorage(access: access, refresh: refresh)
        let clock = TestClock()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        let session = URLSession(configuration: configuration)
        let auth = AuthManager(
            baseURL: baseURL,
            session: session,
            tokenStorage: storage.asStorage,
            now: { clock.date }
        )
        self.baseURL = baseURL
        self.storage = storage
        self.clock = clock
        self.auth = auth
        api = BissbilanzAPI(baseURL: baseURL, authManager: auth, session: session)
    }

    var tokenURL: String {
        "\(baseURL)/api/auth/mobile/token"
    }

    var goalsURL: String {
        "\(baseURL)/api/goals"
    }

    var tokenRequests: Int {
        StubURLProtocol.recordedRequests(baseURL: baseURL).filter { $0 == "POST /api/auth/mobile/token" }.count
    }

    var goalsRequests: Int {
        StubURLProtocol.recordedRequests(baseURL: baseURL).filter { $0 == "GET /api/goals" }.count
    }

    func stubTokens(access: String = "new-access", refresh: String = "new-refresh", delayMs: Int = 0) {
        let json = """
        {"access_token":"\(access)","refresh_token":"\(refresh)","token_type":"Bearer","expires_in":3600}
        """
        StubURLProtocol.stub("POST", tokenURL, json: json, delayMs: delayMs)
    }

    func stubTokenFailure(status: Int, headers: [String: String] = [:]) {
        StubURLProtocol.stub("POST", tokenURL, status: status, json: #"{"message":"nope"}"#, headers: headers)
    }
}

@Suite("AuthManager token refresh")
@MainActor
struct AuthManagerRefreshTests {
    @Test("A refresh stores the rotated pair and stays authenticated")
    func storesTheRotatedPair() async {
        let harness = AuthHarness()
        harness.stubTokens()

        let refreshed = await harness.auth.refreshAccessToken()

        #expect(refreshed)
        #expect(harness.auth.accessToken == "new-access")
        #expect(harness.storage[AuthManager.refreshTokenKey] == "new-refresh")
        #expect(harness.auth.authState == .authenticated)
    }

    @Test("Concurrent callers share one refresh request")
    func concurrentCallersShareOneRequest() async {
        let harness = AuthHarness()
        harness.stubTokens(delayMs: 150)
        let auth = harness.auth

        async let first = auth.refreshAccessToken()
        async let second = auth.refreshAccessToken()
        async let third = auth.refreshAccessToken()
        let results = await [first, second, third]

        #expect(results == [true, true, true])
        #expect(harness.tokenRequests == 1)
    }

    @Test("A 429 keeps the session and blocks further attempts until Retry-After has passed")
    func rateLimitBlocksUntilRetryAfter() async {
        let harness = AuthHarness()
        harness.stubTokenFailure(status: 429, headers: ["Retry-After": "30"])

        #expect(await harness.auth.refreshAccessToken() == false)
        #expect(harness.tokenRequests == 1)
        #expect(harness.auth.authState == .authenticated)
        #expect(harness.storage[AuthManager.refreshTokenKey] == "old-refresh")

        harness.clock.advance(29)
        #expect(await harness.auth.refreshAccessToken() == false)
        #expect(harness.tokenRequests == 1)

        harness.clock.advance(1)
        #expect(await harness.auth.refreshAccessToken() == false)
        #expect(harness.tokenRequests == 2)
    }

    @Test("A 429 without Retry-After waits a minute")
    func rateLimitWithoutRetryAfterWaitsAMinute() async {
        let harness = AuthHarness()
        harness.stubTokenFailure(status: 429)

        _ = await harness.auth.refreshAccessToken()
        harness.clock.advance(59)
        _ = await harness.auth.refreshAccessToken()
        #expect(harness.tokenRequests == 1)

        harness.clock.advance(1)
        _ = await harness.auth.refreshAccessToken()
        #expect(harness.tokenRequests == 2)
    }

    @Test("A huge Retry-After cannot lock refreshing for hours")
    func retryAfterIsCapped() async {
        let harness = AuthHarness()
        harness.stubTokenFailure(status: 429, headers: ["Retry-After": "86400"])

        _ = await harness.auth.refreshAccessToken()
        harness.clock.advance(299)
        _ = await harness.auth.refreshAccessToken()
        #expect(harness.tokenRequests == 1)

        harness.clock.advance(1)
        _ = await harness.auth.refreshAccessToken()
        #expect(harness.tokenRequests == 2)
    }

    @Test("Server errors back off exponentially and keep the session")
    func serverErrorsBackOffExponentially() async {
        let harness = AuthHarness()
        harness.stubTokenFailure(status: 502)

        _ = await harness.auth.refreshAccessToken()
        harness.clock.advance(1)
        _ = await harness.auth.refreshAccessToken()
        #expect(harness.tokenRequests == 1)

        harness.clock.advance(1)
        _ = await harness.auth.refreshAccessToken()
        #expect(harness.tokenRequests == 2)

        harness.clock.advance(3)
        _ = await harness.auth.refreshAccessToken()
        #expect(harness.tokenRequests == 2)

        harness.clock.advance(1)
        _ = await harness.auth.refreshAccessToken()
        #expect(harness.tokenRequests == 3)
        #expect(harness.auth.authState == .authenticated)
        #expect(harness.storage[AuthManager.refreshTokenKey] == "old-refresh")
    }

    @Test("The backoff never exceeds a minute")
    func backoffIsCapped() async {
        let harness = AuthHarness()
        harness.stubTokenFailure(status: 503)

        for _ in 0 ..< 12 {
            _ = await harness.auth.refreshAccessToken()
            harness.clock.advance(60)
        }
        _ = await harness.auth.refreshAccessToken()
        let before = harness.tokenRequests

        harness.clock.advance(59)
        _ = await harness.auth.refreshAccessToken()
        #expect(harness.tokenRequests == before)

        harness.clock.advance(1)
        _ = await harness.auth.refreshAccessToken()
        #expect(harness.tokenRequests == before + 1)
    }

    @Test("A transport failure blocks the next attempt but keeps the tokens")
    func transportFailureBlocks() async {
        let harness = AuthHarness()
        StubURLProtocol.stubError("POST", harness.tokenURL, code: .notConnectedToInternet)

        #expect(await harness.auth.refreshAccessToken() == false)
        #expect(await harness.auth.refreshAccessToken() == false)

        #expect(harness.tokenRequests == 1)
        #expect(harness.auth.authState == .authenticated)
        #expect(harness.storage[AuthManager.refreshTokenKey] == "old-refresh")
    }

    @Test("A success resets the backoff")
    func successResetsTheBackoff() async {
        let harness = AuthHarness()
        harness.stubTokenFailure(status: 502)
        _ = await harness.auth.refreshAccessToken()
        harness.clock.advance(2)
        _ = await harness.auth.refreshAccessToken()
        #expect(harness.tokenRequests == 2)

        harness.stubTokens()
        harness.clock.advance(4)
        #expect(await harness.auth.refreshAccessToken())
        #expect(harness.tokenRequests == 3)

        harness.stubTokenFailure(status: 502)
        #expect(await harness.auth.refreshAccessToken() == false)
        #expect(harness.tokenRequests == 4)

        harness.clock.advance(2)
        _ = await harness.auth.refreshAccessToken()
        #expect(harness.tokenRequests == 5)
    }

    @Test("A definitive rejection expires the session and is not asked twice")
    func definitiveRejectionExpiresOnce() async {
        let harness = AuthHarness()
        harness.stubTokenFailure(status: 401)

        #expect(await harness.auth.refreshAccessToken() == false)
        #expect(harness.auth.authState == .expired)

        #expect(await harness.auth.refreshAccessToken() == false)
        #expect(harness.tokenRequests == 1)
        #expect(harness.auth.authState == .expired)
    }

    @Test("A new refresh token after a rejection is tried again")
    func newTokenAfterRejectionIsTried() async {
        let harness = AuthHarness()
        harness.stubTokenFailure(status: 400)
        _ = await harness.auth.refreshAccessToken()
        #expect(harness.auth.authState == .expired)

        harness.storage[AuthManager.refreshTokenKey] = "fresh-refresh"
        harness.stubTokens()

        #expect(await harness.auth.refreshAccessToken())
        #expect(harness.tokenRequests == 2)
        #expect(harness.auth.authState == .authenticated)
    }

    @Test("A malformed success body is transient, not a sign-out")
    func malformedSuccessIsTransient() async {
        let harness = AuthHarness()
        StubURLProtocol.stub("POST", harness.tokenURL, status: 200, json: "{}")

        #expect(await harness.auth.refreshAccessToken() == false)
        #expect(await harness.auth.refreshAccessToken() == false)

        #expect(harness.tokenRequests == 1)
        #expect(harness.auth.authState == .authenticated)
        #expect(harness.auth.accessToken == "old-access")
    }

    @Test("A request signed with a token that was already replaced is not refreshed again")
    func staleRejectedTokenSkipsTheRefresh() async {
        let harness = AuthHarness()
        harness.stubTokens()
        _ = await harness.auth.refreshAccessToken()
        #expect(harness.tokenRequests == 1)

        #expect(await harness.auth.refreshAccessToken(rejecting: "old-access"))
        #expect(harness.tokenRequests == 1)
    }

    @Test("Rejecting the current token still refreshes")
    func rejectingTheCurrentTokenRefreshes() async {
        let harness = AuthHarness()
        harness.stubTokens()

        #expect(await harness.auth.refreshAccessToken(rejecting: "old-access"))
        #expect(harness.tokenRequests == 1)
        #expect(harness.auth.accessToken == "new-access")
    }

    @Test("Logout forgets a pending block so the next sign-in refreshes straight away")
    func logoutClearsTheBlock() async {
        let harness = AuthHarness()
        harness.stubTokenFailure(status: 429)
        _ = await harness.auth.refreshAccessToken()

        harness.auth.logout()
        harness.storage[AuthManager.accessTokenKey] = "signed-in-again"
        harness.storage[AuthManager.refreshTokenKey] = "fresh-refresh"
        harness.stubTokens()

        #expect(await harness.auth.refreshAccessToken())
        #expect(harness.tokenRequests == 2)
    }

    @Test("A refresh attempt never publishes .refreshing, so observers do not re-run on each attempt")
    func refreshDoesNotFlipTheAuthState() async throws {
        let harness = AuthHarness()
        StubURLProtocol.stub("POST", harness.tokenURL, status: 502, delayMs: 300)
        let auth = harness.auth

        let attempt = Task { await auth.refreshAccessToken() }
        try await Task.sleep(for: .milliseconds(80))
        #expect(auth.authState == .authenticated)

        _ = await attempt.value
        #expect(auth.authState == .authenticated)
    }
}

@Suite("BissbilanzAPI 401 handling")
@MainActor
struct BissbilanzAPIRefreshTests {
    @Test("A 401 refreshes once and retries with the new token")
    func refreshesOnceAndRetries() async throws {
        let harness = AuthHarness()
        harness.stubTokens()
        StubURLProtocol.stubSequence("GET", harness.goalsURL, [
            (status: 401, json: "{}", headers: [:]),
            (status: 200, json: #"{"goals": null}"#, headers: [:]),
        ])

        _ = try await harness.api.getGoals()

        #expect(StubURLProtocol.recordedRequests(baseURL: harness.baseURL) == [
            "GET /api/goals", "POST /api/auth/mobile/token", "GET /api/goals",
        ])
        let sent = StubURLProtocol.recordedHeaders("GET", harness.goalsURL)
        #expect(sent.map { $0["Authorization"] } == ["Bearer old-access", "Bearer new-access"])
    }

    @Test("A second 401 after the refresh is final: one refresh, one retry")
    func secondRejectionDoesNotLoop() async {
        let harness = AuthHarness()
        harness.stubTokens()
        StubURLProtocol.stub("GET", harness.goalsURL, status: 401)

        var unauthorized = 0
        do {
            _ = try await harness.api.getGoals()
        } catch APIError.unauthorized {
            unauthorized += 1
        } catch {
            Issue.record("Expected APIError.unauthorized, got \(error)")
        }

        #expect(unauthorized == 1)
        #expect(harness.tokenRequests == 1)
        #expect(harness.goalsRequests == 2)
    }

    @Test("A throttled refresh is asked once, however many requests fail behind it")
    func throttledRefreshIsAskedOnce() async {
        let harness = AuthHarness()
        harness.stubTokenFailure(status: 429, headers: ["Retry-After": "30"])
        StubURLProtocol.stub("GET", harness.goalsURL, status: 401)

        var retryable = 0
        for _ in 0 ..< 6 {
            do {
                _ = try await harness.api.getGoals()
            } catch APIError.networkError {
                retryable += 1
            } catch {
                Issue.record("Expected APIError.networkError, got \(error)")
            }
        }

        #expect(retryable == 6)
        #expect(harness.tokenRequests == 1)
        #expect(harness.auth.authState == .authenticated)
    }

    @Test("Requests go through again once the throttle has passed")
    func requestsRecoverAfterTheThrottle() async throws {
        let harness = AuthHarness()
        harness.stubTokenFailure(status: 429, headers: ["Retry-After": "30"])
        StubURLProtocol.stub("GET", harness.goalsURL, status: 401)
        do {
            _ = try await harness.api.getGoals()
            Issue.record("Expected the throttled refresh to fail the request")
        } catch APIError.networkError {
            #expect(harness.tokenRequests == 1)
        } catch {
            Issue.record("Expected APIError.networkError, got \(error)")
        }

        harness.clock.advance(30)
        harness.stubTokens()
        StubURLProtocol.stubSequence("GET", harness.goalsURL, [
            (status: 401, json: "{}", headers: [:]),
            (status: 200, json: #"{"goals": null}"#, headers: [:]),
        ])

        _ = try await harness.api.getGoals()

        #expect(harness.tokenRequests == 2)
        let sent = StubURLProtocol.recordedHeaders("GET", harness.goalsURL)
        #expect(sent.last?["Authorization"] == "Bearer new-access")
    }

    @Test("A session the server rejected is reported as unauthorized without more token requests")
    func rejectedSessionStopsAsking() async {
        let harness = AuthHarness()
        harness.stubTokenFailure(status: 401)
        StubURLProtocol.stub("GET", harness.goalsURL, status: 401)

        var unauthorized = 0
        for _ in 0 ..< 4 {
            do {
                _ = try await harness.api.getGoals()
            } catch APIError.unauthorized {
                unauthorized += 1
            } catch {
                Issue.record("Expected APIError.unauthorized, got \(error)")
            }
        }

        #expect(unauthorized == 4)
        #expect(harness.tokenRequests == 1)
        #expect(harness.auth.authState == .expired)
    }
}
