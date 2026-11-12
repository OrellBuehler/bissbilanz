@testable import Bissbilanz
import Foundation
import SwiftData
import Testing

@Suite("Food enrichment controller")
@MainActor
struct FoodEnrichmentControllerTests {
    private func controller(
        _ harness: RepositoryHarness,
        foodRepository: FoodRepository? = nil
    ) -> FoodEnrichmentController {
        FoodEnrichmentController(
            api: harness.api,
            appMode: harness.appMode,
            connectivity: harness.connectivity,
            foodRepository: foodRepository ?? harness.foodRepository,
            defaults: harness.defaults,
            delay: { _ in }
        )
    }

    private func statusJSON(_ state: String?, candidates: Int = 5, processed: Int = 0, updated: Int = 0) -> String {
        guard let state else { return #"{"candidates": \#(candidates), "job": null}"# }
        return """
        {"candidates": \(candidates), "job": {"state": "\(state)", "total": 5, "processed": \(processed),
         "updated": \(updated), "notFound": 0, "failed": 0, "startedAt": "2026-11-12T08:00:00.000Z",
         "finishedAt": null}}
        """
    }

    private func requests(_ harness: RepositoryHarness, _ request: String) -> Int {
        harness.recordedRequests.filter { $0 == request }.count
    }

    private func waitUntil(_ condition: () -> Bool) async throws {
        for _ in 0 ..< 300 where !condition() {
            try await Task.sleep(for: .milliseconds(10))
        }
    }

    private func food(id: String, barcode: String) throws -> Food {
        try JSONPatch.decode(Food.self, from: [
            "id": id, "userId": "u1", "name": "Food \(id)", "servingSize": 100, "servingUnit": "g",
            "calories": 100, "protein": 1, "carbs": 1, "fat": 1, "fiber": 1, "isFavorite": false, "barcode": barcode,
        ])
    }

    @Test("Loading the status fills the Settings summary and caches the count")
    func refreshCachesCandidates() async throws {
        let harness = try RepositoryHarness()
        harness.stub("GET", "/api/foods/enrichment", json: statusJSON(nil, candidates: 7))
        let enrichment = controller(harness)
        #expect(enrichment.settingsSummary == nil)

        #expect(await enrichment.refreshStatus())

        #expect(enrichment.status?.candidates == 7)
        #expect(enrichment.settingsSummary == L10n.unlabeledFoodCount(7))
        #expect(controller(harness).settingsSummary == L10n.unlabeledFoodCount(7))
        #expect(!enrichment.shouldPoll)
    }

    @Test("Settings does not ask the server again while the cached status is fresh")
    func settingsRefreshIsThrottled() async throws {
        let harness = try RepositoryHarness()
        harness.stub("GET", "/api/foods/enrichment", json: statusJSON(nil))
        let enrichment = controller(harness)

        await enrichment.refreshForSettings()
        await enrichment.refreshForSettings()

        #expect(requests(harness, "GET /api/foods/enrichment") == 1)
    }

    @Test("Starting a run is a direct request, never a queued sync operation")
    func startIsDirect() async throws {
        let harness = try RepositoryHarness()
        harness.stub("POST", "/api/foods/enrichment", status: 202, json: statusJSON("queued"))
        let enrichment = controller(harness)

        await enrichment.startJob()

        #expect(enrichment.isJobActive)
        #expect(enrichment.shouldPoll)
        #expect(enrichment.settingsSummary == L10n.enhanceFoodsQueued)
        #expect(requests(harness, "POST /api/foods/enrichment") == 1)
        #expect(harness.syncManager.queuedRows().isEmpty)
        #expect(enrichment.notice == nil)
    }

    @Test("Offline, start and stop do nothing but say so")
    func offlineActionsAreRefused() async throws {
        let harness = try RepositoryHarness(online: false)
        let enrichment = controller(harness)

        await enrichment.startJob()
        await enrichment.cancelJob()
        let refreshed = await enrichment.refreshStatus()

        #expect(!refreshed)
        #expect(enrichment.notice == .offline)
        #expect(harness.recordedRequests.isEmpty)
        #expect(harness.syncManager.queuedRows().isEmpty)
    }

    @Test("A rate-limited start is shown and not retried until Retry-After has passed")
    func rateLimitedStart() async throws {
        let harness = try RepositoryHarness()
        harness.stub(
            "POST", "/api/foods/enrichment", status: 429,
            json: #"{"error": "Too many requests"}"#, headers: ["Retry-After": "30"]
        )
        let enrichment = controller(harness)

        await enrichment.startJob()
        await enrichment.startJob()

        #expect(requests(harness, "POST /api/foods/enrichment") == 1)
        guard case let .rateLimited(seconds)? = enrichment.notice else {
            Issue.record("expected a rate-limit notice, got \(String(describing: enrichment.notice))")
            return
        }
        #expect((1 ... 30).contains(seconds))
        #expect(!enrichment.isSubmitting)
    }

    @Test("A failed start says so without changing the known status")
    func failedStart() async throws {
        let harness = try RepositoryHarness()
        harness.stub("GET", "/api/foods/enrichment", json: statusJSON(nil, candidates: 3))
        harness.stub("POST", "/api/foods/enrichment", status: 500, json: #"{"error": "boom"}"#)
        let enrichment = controller(harness)
        await enrichment.refreshStatus()

        await enrichment.startJob()

        #expect(enrichment.notice == .actionFailed)
        #expect(enrichment.status?.candidates == 3)
        #expect(!enrichment.isJobActive)
    }

    @Test("Stopping sends a DELETE and shows the cancelled run")
    func cancelSendsDelete() async throws {
        let harness = try RepositoryHarness()
        harness.stub("POST", "/api/foods/enrichment", status: 202, json: statusJSON("running", processed: 1))
        harness.stub("DELETE", "/api/foods/enrichment", json: statusJSON("cancelled", processed: 2))
        let enrichment = controller(harness)
        await enrichment.startJob()

        await enrichment.cancelJob()

        #expect(enrichment.status?.job?.phase == .cancelled)
        #expect(!enrichment.shouldPoll)
        #expect(requests(harness, "DELETE /api/foods/enrichment") == 1)
        #expect(harness.syncManager.queuedRows().isEmpty)
    }

    @Test("Polling follows the run and refreshes local foods once it finished with updates")
    func pollingRefreshesFoodsWhenFinished() async throws {
        let harness = try RepositoryHarness()
        harness.stub("POST", "/api/foods/enrichment", status: 202, json: statusJSON("queued"))
        harness.stubSequence("GET", "/api/foods/enrichment", [
            (status: 200, json: statusJSON("running", processed: 2, updated: 1), headers: [:]),
            (status: 200, json: statusJSON("completed", candidates: 0, processed: 5, updated: 1), headers: [:]),
        ])
        harness.stub("GET", "/api/foods", json: """
        {"foods": [{"id": "f1", "userId": "u1", "name": "Skyr", "servingSize": 150, "servingUnit": "g",
         "calories": 90, "protein": 15, "carbs": 6, "fat": 0.3, "fiber": 0, "isFavorite": false,
         "barcode": "111", "nutriScore": "a", "novaGroup": 1}], "total": 1, "nextCursor": null}
        """)
        harness.stub("GET", "/api/foods/ids", json: #"{"ids": ["f1"]}"#)
        let enrichment = controller(harness)
        await enrichment.startJob()

        await enrichment.pollWhileActive()
        try await waitUntil { harness.foodRepository.food(id: "f1") != nil }

        #expect(enrichment.status?.job?.phase == .completed)
        #expect(!enrichment.shouldPoll)
        #expect(requests(harness, "GET /api/foods/enrichment") == 2)
        #expect(harness.foodRepository.food(id: "f1")?.nutriScore == "a")
        #expect(enrichment.settingsSummary == nil)
    }

    @Test("A run that finished without updates does not resync foods")
    func noResyncWithoutUpdates() async throws {
        let harness = try RepositoryHarness()
        harness.stub("POST", "/api/foods/enrichment", status: 202, json: statusJSON("running"))
        harness.stub("GET", "/api/foods/enrichment", json: statusJSON("completed", processed: 5))
        let enrichment = controller(harness)
        await enrichment.startJob()

        await enrichment.pollWhileActive()
        try await Task.sleep(for: .milliseconds(50))

        #expect(!harness.recordedRequests.contains { $0.hasPrefix("GET /api/foods?") || $0 == "GET /api/foods" })
    }

    @Test("Polling gives up after repeated failures and offers a retry")
    func pollingStopsAfterFailures() async throws {
        let harness = try RepositoryHarness()
        harness.stub("POST", "/api/foods/enrichment", status: 202, json: statusJSON("running"))
        harness.stub("GET", "/api/foods/enrichment", status: 500, json: #"{"error": "boom"}"#)
        let enrichment = controller(harness)
        await enrichment.startJob()

        await enrichment.pollWhileActive()

        #expect(requests(harness, "GET /api/foods/enrichment") == FoodEnrichmentRules.maxPollFailures)
        #expect(enrichment.loadFailed)
        #expect(!enrichment.shouldPoll)
        #expect(enrichment.isJobActive)

        harness.stub("GET", "/api/foods/enrichment", json: statusJSON("running", processed: 3))
        #expect(await enrichment.refreshStatus())
        #expect(!enrichment.loadFailed)
        #expect(enrichment.shouldPoll)
    }

    @Test("Local mode never talks to the server job")
    func localModeSkipsServer() async throws {
        let harness = try RepositoryHarness(mode: .local)
        try harness.context.insert(LocalFood(food: food(id: "f1", barcode: "7610000000201")))
        try harness.context.save()
        let enrichment = controller(harness)

        await enrichment.refreshForSettings()
        await enrichment.startJob()

        #expect(harness.recordedRequests.isEmpty)
        #expect(!enrichment.shouldPoll)
        #expect(enrichment.localCandidateCount == 1)
        #expect(enrichment.settingsSummary == L10n.unlabeledFoodCount(1))
    }

    @Test("The local sweep runs outside the screen, records results and marks foods checked")
    func localSweepRuns() async throws {
        let harness = try RepositoryHarness(mode: .local)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        let repo = FoodRepository(
            context: harness.context,
            api: harness.api,
            appMode: harness.appMode,
            syncManager: harness.syncManager,
            defaults: harness.defaults,
            openFoodFacts: OpenFoodFactsClient(session: URLSession(configuration: configuration))
        )
        try harness.context.insert(LocalFood(food: food(id: "found", barcode: "7610000000202")))
        try harness.context.insert(LocalFood(food: food(id: "missing", barcode: "7610000000203")))
        try harness.context.save()
        StubURLProtocol.stub(
            "GET", "https://world.openfoodfacts.org/api/v2/product/7610000000202.json",
            json: """
            {"status": 1, "product": {"product_name": "Oats", "nutriscore_grade": "a", "nova_group": 1,
             "nutriments": {}}}
            """
        )
        StubURLProtocol.stub(
            "GET", "https://world.openfoodfacts.org/api/v2/product/7610000000203.json",
            json: #"{"status": 0}"#
        )
        let enrichment = controller(harness, foodRepository: repo)
        enrichment.refreshLocalCount()
        #expect(enrichment.localCandidateCount == 2)

        enrichment.startLocalSweep()
        #expect(enrichment.isSweepRunning)
        try await waitUntil { !enrichment.isSweepRunning }

        #expect(enrichment.sweep.state == .completed)
        #expect(enrichment.sweep.done == 2)
        #expect(enrichment.sweep.updated == 1)
        #expect(enrichment.sweep.notFound == 1)
        #expect(enrichment.sweep.failed == 0)
        #expect(enrichment.localCandidateCount == 0)
        #expect(repo.food(id: "found")?.nutriScore == "a")
        #expect(repo.food(id: "missing")?.offCheckedAt != nil)
        #expect(harness.syncManager.queuedRows().isEmpty)
    }

    @Test("Stopping the local sweep ends it without counting the interrupted food")
    func localSweepStops() async throws {
        let harness = try RepositoryHarness(mode: .local)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        let repo = FoodRepository(
            context: harness.context,
            api: harness.api,
            appMode: harness.appMode,
            syncManager: harness.syncManager,
            defaults: harness.defaults,
            openFoodFacts: OpenFoodFactsClient(session: URLSession(configuration: configuration))
        )
        try harness.context.insert(LocalFood(food: food(id: "slow", barcode: "7610000000204")))
        try harness.context.save()
        StubURLProtocol.stub(
            "GET", "https://world.openfoodfacts.org/api/v2/product/7610000000204.json",
            json: #"{"status": 0}"#,
            delayMs: 2000
        )
        let enrichment = controller(harness, foodRepository: repo)

        enrichment.startLocalSweep()
        try await Task.sleep(for: .milliseconds(50))
        enrichment.stopLocalSweep()
        try await waitUntil { !enrichment.isSweepRunning }

        #expect(enrichment.sweep.state == .stopped)
        #expect(enrichment.sweep.done == 0)
        #expect(repo.food(id: "slow")?.offCheckedAt == nil)
    }

    @Test("Offline, the local sweep does not start")
    func localSweepNeedsConnection() async throws {
        let harness = try RepositoryHarness(mode: .local, online: false)
        try harness.context.insert(LocalFood(food: food(id: "f1", barcode: "7610000000205")))
        try harness.context.save()
        let enrichment = controller(harness)

        enrichment.startLocalSweep()

        #expect(enrichment.sweep.state == .offline)
        #expect(!enrichment.isSweepRunning)
    }

    @Test("Signing out forgets the server status and the cached count")
    func resetClearsState() async throws {
        let harness = try RepositoryHarness()
        harness.stub("GET", "/api/foods/enrichment", json: statusJSON(nil, candidates: 4))
        let enrichment = controller(harness)
        await enrichment.refreshStatus()

        enrichment.reset()

        #expect(enrichment.status == nil)
        #expect(enrichment.settingsSummary == nil)
        #expect(controller(harness).cachedCandidates == nil)
    }
}
