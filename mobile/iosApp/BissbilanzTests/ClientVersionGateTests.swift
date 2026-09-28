@testable import Bissbilanz
import Foundation
import Testing

@Suite("ClientVersionHeader")
struct ClientVersionHeaderTests {
    @Test("Applies the platform and version headers to a request")
    func appliesHeaders() throws {
        var request = URLRequest(url: try #require(URL(string: "https://example.com/api/foods")))
        ClientVersionHeader.apply(to: &request)

        #expect(request.value(forHTTPHeaderField: "X-Client-Platform") == "ios")
        #expect(request.value(forHTTPHeaderField: "X-Client-Version") == ClientVersionHeader.current)
    }

    @Test("Reads minVersion from the X-Client-Min-Version header first")
    func minVersionFromHeader() throws {
        let url = try #require(URL(string: "https://example.com/api/foods"))
        let response = try #require(HTTPURLResponse(
            url: url, statusCode: 426, httpVersion: nil,
            headerFields: ["X-Client-Min-Version": "1.53.0"]
        ))
        // A header takes priority even when the body disagrees, so a proxy that
        // rewrites one but not the other can't produce a mismatched result.
        let body = Data(#"{"minVersion": "9.9.9"}"#.utf8)

        #expect(ClientVersionHeader.minVersion(from: response, data: body) == "1.53.0")
    }

    @Test("Falls back to the JSON body's minVersion when the header is missing")
    func minVersionFromBody() throws {
        let url = try #require(URL(string: "https://example.com/api/foods"))
        let response = try #require(HTTPURLResponse(url: url, statusCode: 426, httpVersion: nil, headerFields: [:]))
        let body = Data(
            #"{"error":"Update required","code":"client_update_required","platform":"ios","minVersion":"1.53.0"}"#.utf8
        )

        #expect(ClientVersionHeader.minVersion(from: response, data: body) == "1.53.0")
    }

    @Test("Falls back to \"unknown\" when neither the header nor the body has it")
    func minVersionUnknownFallback() throws {
        let url = try #require(URL(string: "https://example.com/api/foods"))
        let response = try #require(HTTPURLResponse(url: url, statusCode: 426, httpVersion: nil, headerFields: [:]))

        #expect(ClientVersionHeader.minVersion(from: response, data: Data()) == "unknown")
    }
}

@Suite("UpdateRequiredGate")
@MainActor
struct UpdateRequiredGateTests {
    @Test("Starts clear and flips once flagged")
    func flagsOnce() {
        let gate = UpdateRequiredGate()
        #expect(gate.isUpdateRequired == false)
        #expect(gate.minVersion == nil)

        gate.flag(minVersion: "1.53.0")

        #expect(gate.isUpdateRequired == true)
        #expect(gate.minVersion == "1.53.0")
    }
}

@Suite("APIError.updateRequired")
struct APIErrorUpdateRequiredTests {
    @Test("Error description includes the minimum version")
    func errorDescription() {
        let error = APIError.updateRequired(minVersion: "1.53.0")
        #expect(error.errorDescription == "Update required (minimum version 1.53.0)")
    }
}

@Suite("BissbilanzAPI client version header + 426 handling")
@MainActor
struct BissbilanzAPIUpdateRequiredTests {
    @Test("Every request carries the client platform and version headers")
    func headersAttachedToServerRequests() async throws {
        let harness = try RepositoryHarness()
        harness.stub("GET", "/api/goals", json: #"{"goals": null}"#)

        _ = try await harness.api.getGoals()

        let headers = try #require(harness.recordedHeaders("GET", "/api/goals").first)
        #expect(headers["X-Client-Platform"] == "ios")
        #expect(headers["X-Client-Version"] == ClientVersionHeader.current)
    }

    @Test("A 426 response maps to updateRequired and flags the shared gate")
    func updateRequiredResponseFlagsGate() async throws {
        let harness = try RepositoryHarness()
        harness.stub(
            "GET", "/api/goals", status: 426,
            json: #"{"error":"Update required","code":"client_update_required","platform":"ios","minVersion":"1.53.0"}"#,
            headers: ["X-Client-Min-Version": "1.53.0"]
        )

        do {
            _ = try await harness.api.getGoals()
            Issue.record("Expected getGoals to throw APIError.updateRequired")
        } catch APIError.updateRequired(let minVersion) {
            #expect(minVersion == "1.53.0")
        } catch {
            Issue.record("Expected APIError.updateRequired, got \(error)")
        }
        #expect(harness.api.updateGate.isUpdateRequired == true)
        #expect(harness.api.updateGate.minVersion == "1.53.0")
    }

    @Test("A 426 on a native multipart upload (e.g. an image) is caught the same way")
    func updateRequiredOnMultipartUpload() async throws {
        let harness = try RepositoryHarness()
        harness.stub(
            "POST", "/api/images/upload", status: 426,
            json: #"{"error":"Update required","code":"client_update_required","platform":"ios","minVersion":"1.53.0"}"#,
            headers: ["X-Client-Min-Version": "1.53.0"]
        )

        do {
            _ = try await harness.api.uploadImage(Data("fake-image-bytes".utf8))
            Issue.record("Expected uploadImage to throw APIError.updateRequired")
        } catch APIError.updateRequired {
            // expected
        } catch {
            Issue.record("Expected APIError.updateRequired, got \(error)")
        }
        #expect(harness.api.updateGate.minVersion == "1.53.0")
    }
}

@Suite("AuthManager version gate integration")
@MainActor
struct AuthManagerUpdateRequiredTests {
    private func makeStubbedAuthManager(baseURL: String, gate: UpdateRequiredGate) -> AuthManager {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        return AuthManager(baseURL: baseURL, session: URLSession(configuration: configuration), updateGate: gate)
    }

    @Test("fetchLoginProviders flags the gate on 426 and returns nil rather than a stale provider list")
    func fetchLoginProvidersFlagsGateOn426() async throws {
        let baseURL = "https://stub-auth-\(UUID().uuidString.lowercased()).local"
        let gate = UpdateRequiredGate()
        let auth = makeStubbedAuthManager(baseURL: baseURL, gate: gate)
        StubURLProtocol.stub(
            "GET", "\(baseURL)/api/auth/providers", status: 426,
            json: #"{"error":"Update required","code":"client_update_required","platform":"ios","minVersion":"1.53.0"}"#,
            headers: ["X-Client-Min-Version": "1.53.0"]
        )

        let providers = await auth.fetchLoginProviders()

        #expect(providers == nil)
        #expect(gate.minVersion == "1.53.0")
    }

    @Test("handleCallback flags the gate on 426 and does not sign the user in")
    func handleCallbackFlagsGateOn426() async throws {
        let baseURL = "https://stub-auth-\(UUID().uuidString.lowercased()).local"
        let gate = UpdateRequiredGate()
        let auth = makeStubbedAuthManager(baseURL: baseURL, gate: gate)
        let loginURL = try #require(auth.buildLoginURL())
        let state = try #require(
            URLComponents(url: loginURL, resolvingAgainstBaseURL: false)?
                .queryItems?.first { $0.name == "state" }?.value
        )
        StubURLProtocol.stub(
            "POST", "\(baseURL)/api/auth/mobile/token", status: 426,
            json: #"{"error":"Update required","code":"client_update_required","platform":"ios","minVersion":"1.53.0"}"#,
            headers: ["X-Client-Min-Version": "1.53.0"]
        )

        let callbackURL = try #require(URL(string: "bissbilanz://callback?code=abc123&state=\(state)"))
        let result = await auth.handleCallback(url: callbackURL)

        #expect(result == false)
        // Never signed in over this — only the build is too old, not the code.
        #expect(auth.authState != .authenticated)
        #expect(gate.minVersion == "1.53.0")
    }
}

@Suite("SyncManager 426 handling")
@MainActor
struct SyncManagerUpdateRequiredTests {
    private func makeFoodCreate(name: String = "Skyr") -> FoodCreate {
        FoodCreate(
            name: name, servingSize: 150, servingUnit: .g,
            calories: 98, protein: 16, carbs: 6, fat: 0.2, fiber: 0
        )
    }

    @Test("A 426 pauses the drain without retrying, dropping, or touching the op's attempts")
    func updateRequiredPausesDrainWithoutBurningAttempt() async throws {
        let harness = try RepositoryHarness()
        harness.stub(
            "POST", "/api/foods", status: 426,
            json: #"{"error":"Update required","code":"client_update_required","platform":"ios","minVersion":"1.53.0"}"#,
            headers: ["X-Client-Min-Version": "1.53.0"]
        )
        harness.stub("POST", "/api/goals", json: "{}")

        harness.syncManager.enqueue(.createFood(body: makeFoodCreate(), localId: LocalStore.makeTempId()))
        harness.syncManager.enqueue(.setGoals(body: .defaults))

        let drained = await harness.syncManager.drainPendingQueue()

        #expect(drained == 0)
        // Both ops are still queued, in order, and the 426'd one never spent a
        // retry attempt — unlike a 5xx/decode failure, which increments it.
        #expect(harness.syncManager.queuedRows().map(\.type) == ["create_food", "set_goals"])
        #expect(harness.syncManager.queuedRows().first?.retryCount == 0)
        // A server-scoped failure ends the drain: the op behind it is never attempted.
        #expect(!harness.recordedRequests.contains("POST /api/goals"))
        #expect(harness.syncManager.errors.isEmpty)
        #expect(harness.api.updateGate.minVersion == "1.53.0")
    }

    @Test("Draining again while still on an old build keeps re-pausing on the same op")
    func repeatedDrainsKeepPausingWithoutProgress() async throws {
        let harness = try RepositoryHarness()
        harness.stub(
            "POST", "/api/foods", status: 426,
            json: #"{"error":"Update required","code":"client_update_required","platform":"ios","minVersion":"1.53.0"}"#
        )
        harness.syncManager.enqueue(.createFood(body: makeFoodCreate(), localId: LocalStore.makeTempId()))

        _ = await harness.syncManager.drainPendingQueue()
        _ = await harness.syncManager.drainPendingQueue()

        #expect(harness.syncManager.queuedRows().count == 1)
        #expect(harness.syncManager.queuedRows().first?.retryCount == 0)
    }
}
