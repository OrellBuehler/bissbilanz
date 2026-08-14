@testable import Bissbilanz
import Foundation
import SwiftData
import Testing

/// Covers `BackgroundRefresher.pull` — the testable core of the BGAppRefresh
/// background run (the BGTaskScheduler plumbing itself needs a device).
@MainActor
struct BackgroundRefresherTests {
    private func dependencies(_ harness: RepositoryHarness) -> BackgroundRefresher.Dependencies {
        BackgroundRefresher.Dependencies(
            context: harness.context,
            syncManager: harness.syncManager,
            entryRepository: harness.entryRepository,
            goalsRepository: harness.goalsRepository,
            weightRepository: harness.weightRepository,
            sleepRepository: harness.sleepRepository,
            foodRepository: harness.foodRepository
        )
    }

    private func stubPulls(_ harness: RepositoryHarness) {
        harness.stub("GET", "/api/entries", json: #"{"entries": []}"#)
        harness.stub("GET", "/api/goals", json: #"{"goals": null}"#)
        harness.stub("GET", "/api/weight", json: #"{"entries": []}"#)
        harness.stub("GET", "/api/sleep", json: #"{"entries": []}"#)
        harness.stub("GET", "/api/favorites", json: #"{"foods": [], "recipes": []}"#)
    }

    @Test("Pull caches entries logged server-side (the MCP case)")
    func pullCachesServerEntries() async throws {
        let harness = try RepositoryHarness()
        stubPulls(harness)
        let today = DateFormatting.today
        harness.stub("GET", "/api/entries", json: """
        {"entries": [{
            "id": "e1", "mealType": "Lunch", "servings": 1,
            "foodName": "MCP Apple", "calories": 95, "date": "\(today)"
        }]}
        """)

        let deps = dependencies(harness)
        await BackgroundRefresher.pull(deps)

        #expect(deps.entryRepository.entries(date: today).map(\.id) == ["e1"])
    }

    @Test("Pull drains the offline queue before fetching")
    func pullDrainsQueueBeforeFetching() async throws {
        let harness = try RepositoryHarness()
        stubPulls(harness)
        let today = DateFormatting.today
        harness.stub("POST", "/api/entries", json: """
        {"entry": {"id": "server-1", "mealType": "lunch", "servings": 1, "date": "\(today)"}}
        """)
        let deps = dependencies(harness)
        _ = try await deps.entryRepository.createEntry(
            EntryCreate(foodId: "f1", mealType: "lunch", servings: 1, date: today)
        )

        await BackgroundRefresher.pull(deps)

        let requests = harness.recordedRequests
        let upload = try #require(requests.firstIndex(of: "POST /api/entries"))
        let fetch = try #require(requests.firstIndex(of: "GET /api/entries"))
        #expect(upload < fetch)
    }

    @Test("Pull never touches the network in Local mode")
    func pullSkipsNetworkInLocalMode() async throws {
        let harness = try RepositoryHarness(mode: .local)
        stubPulls(harness)

        await BackgroundRefresher.pull(dependencies(harness))

        #expect(harness.recordedRequests.isEmpty)
    }

    @Test("One failing fetch doesn't stop the remaining pulls")
    func pullContinuesPastFailures() async throws {
        let harness = try RepositoryHarness()
        stubPulls(harness)
        harness.stubError("GET", "/api/entries", code: .timedOut)

        await BackgroundRefresher.pull(dependencies(harness))

        #expect(harness.recordedRequests.contains("GET /api/goals"))
        #expect(harness.recordedRequests.contains("GET /api/favorites"))
    }
}
