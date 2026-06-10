@testable import Bissbilanz
import Foundation
import SwiftData
import Testing

@Suite("Sync manager drain semantics")
@MainActor
struct SyncManagerTests {
    private func makeFoodCreate(name: String = "Skyr") -> FoodCreate {
        FoodCreate(
            name: name, servingSize: 150, servingUnit: .g,
            calories: 98, protein: 16, carbs: 6, fat: 0.2, fiber: 0
        )
    }

    @Test("Successful drain uploads FIFO and empties the queue")
    func successfulDrainUploadsFIFO() async throws {
        let harness = try RepositoryHarness()
        harness.stub("POST", "/api/foods", json: """
        {"food": {
            "id": "f-server", "userId": "u1", "name": "Skyr", "servingSize": 150, "servingUnit": "g",
            "calories": 98, "protein": 16, "carbs": 6, "fat": 0.2, "fiber": 0, "isFavorite": false
        }}
        """)
        harness.stub("POST", "/api/goals", json: "{}")

        harness.syncManager.enqueue(.createFood(body: makeFoodCreate(), localId: LocalStore.makeTempId()))
        harness.syncManager.enqueue(.setGoals(body: .defaults))

        let drained = await harness.syncManager.drainPendingQueue()

        #expect(drained == 2)
        #expect(harness.syncManager.queuedRows().isEmpty)
        #expect(harness.syncManager.pendingCount == 0)
        #expect(harness.recordedRequests == ["POST /api/foods", "POST /api/goals"])
        #expect(harness.syncManager.errors.isEmpty)
    }

    @Test("4xx responses drop the operation and record an error")
    func clientErrorDropsOperation() async throws {
        let harness = try RepositoryHarness()
        harness.stub("POST", "/api/foods", status: 400, json: #"{"error": "invalid"}"#)
        harness.stub("POST", "/api/goals", json: "{}")

        harness.syncManager.enqueue(.createFood(body: makeFoodCreate(), localId: LocalStore.makeTempId()))
        harness.syncManager.enqueue(.setGoals(body: .defaults))

        await harness.syncManager.drainPendingQueue()

        // The rejected op is gone, draining continued with the next op.
        #expect(harness.syncManager.queuedRows().isEmpty)
        #expect(harness.syncManager.errors.count == 1)
        #expect(harness.syncManager.errors.first?.contains("HTTP 400") == true)
        #expect(harness.recordedRequests.contains("POST /api/goals"))
    }

    @Test("5xx responses stop draining, then drop after the retry cap")
    func serverErrorRetriesThenDrops() async throws {
        let harness = try RepositoryHarness()
        harness.stub("POST", "/api/foods", status: 500, json: #"{"error": "boom"}"#)
        harness.stub("POST", "/api/goals", json: "{}")

        harness.syncManager.enqueue(.createFood(body: makeFoodCreate(), localId: LocalStore.makeTempId()))
        harness.syncManager.enqueue(.setGoals(body: .defaults))

        // Attempts 1 and 2: the failing head-of-queue blocks everything behind it.
        await harness.syncManager.drainPendingQueue()
        #expect(harness.syncManager.queuedRows().count == 2)
        #expect(harness.syncManager.queuedRows().first?.retryCount == 1)
        #expect(!harness.recordedRequests.contains("POST /api/goals"))

        await harness.syncManager.drainPendingQueue()
        #expect(harness.syncManager.queuedRows().first?.retryCount == 2)

        // Attempt 3 hits the cap: the op is dropped and draining continues.
        await harness.syncManager.drainPendingQueue()
        #expect(harness.syncManager.queuedRows().isEmpty)
        #expect(harness.syncManager.errors.contains { $0.contains("Gave up syncing create food") })
        #expect(harness.recordedRequests.contains("POST /api/goals"))
    }

    @Test("A final 401 stops draining and keeps the queue")
    func unauthorizedStopsDraining() async throws {
        let harness = try RepositoryHarness()
        harness.stub("POST", "/api/foods", status: 401, json: #"{"error": "unauthorized"}"#)
        harness.stub("POST", "/api/goals", json: "{}")

        harness.syncManager.enqueue(.createFood(body: makeFoodCreate(), localId: LocalStore.makeTempId()))
        harness.syncManager.enqueue(.setGoals(body: .defaults))

        await harness.syncManager.drainPendingQueue()

        #expect(harness.syncManager.queuedRows().count == 2)
        #expect(harness.syncManager.errors.first?.contains("Session expired") == true)
        #expect(!harness.recordedRequests.contains("POST /api/goals"))
    }

    @Test("Offline drain is a no-op")
    func offlineDrainDoesNothing() async throws {
        let harness = try RepositoryHarness(online: false)
        harness.stub("POST", "/api/goals", json: "{}")

        harness.syncManager.enqueue(.setGoals(body: .defaults))
        let drained = await harness.syncManager.drainPendingQueue()

        #expect(drained == 0)
        #expect(harness.syncManager.queuedRows().count == 1)
        #expect(harness.recordedRequests.isEmpty)
    }

    @Test("Local mode never enqueues and never drains")
    func localModeNoEnqueueNoDrain() async throws {
        let harness = try RepositoryHarness(mode: .local)
        harness.stub("POST", "/api/goals", json: "{}")

        harness.syncManager.enqueue(.setGoals(body: .defaults))
        let drained = await harness.syncManager.drainPendingQueue()

        #expect(drained == 0)
        #expect(harness.syncManager.queuedRows().isEmpty)
        #expect(harness.recordedRequests.isEmpty)
    }

    @Test("Queue survives across manager instances (persisted in the store)")
    func queuePersistsInStore() throws {
        let harness = try RepositoryHarness()
        harness.syncManager.enqueue(.deleteFood(id: "f1"))
        harness.syncManager.enqueue(.deleteEntry(id: "e1"))

        // A fresh manager over the same context sees the same rows in order.
        let second = SyncManager(
            context: harness.context,
            api: harness.api,
            appMode: harness.appMode,
            connectivity: harness.connectivity
        )
        second.autoDrain = false
        #expect(second.pendingCount == 2)
        #expect(second.queuedRows().map(\.type) == ["delete_food", "delete_entry"])
    }
}
