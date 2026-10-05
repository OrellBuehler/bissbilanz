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

        // Creates always have their optimistic local row (repositories write
        // it before enqueueing) — a missing row means "deleted while in
        // flight" and would enqueue a compensating delete.
        let tempId = LocalStore.makeTempId()
        let temp = try FoodRepository.makeFood(from: makeFoodCreate(), id: tempId)
        harness.context.insert(LocalFood(food: temp))
        try harness.context.save()
        harness.syncManager.enqueue(.createFood(body: makeFoodCreate(), localId: tempId))
        harness.syncManager.enqueue(.setGoals(body: .defaults))

        let drained = await harness.syncManager.drainPendingQueue()

        #expect(drained == 2)
        #expect(harness.syncManager.queuedRows().isEmpty)
        #expect(harness.syncManager.pendingCount == 0)
        #expect(harness.recordedRequests == ["POST /api/foods", "POST /api/goals"])
        #expect(harness.syncManager.errors.isEmpty)
    }

    @Test("4xx responses park the operation for review instead of deleting it")
    func clientErrorParksOperation() async throws {
        let harness = try RepositoryHarness()
        harness.stub("POST", "/api/foods", status: 400, json: #"{"error": "invalid"}"#)
        harness.stub("POST", "/api/goals", json: "{}")

        harness.syncManager.enqueue(.createFood(body: makeFoodCreate(), localId: LocalStore.makeTempId()))
        harness.syncManager.enqueue(.setGoals(body: .defaults))

        await harness.syncManager.drainPendingQueue()

        // The rejected op is parked (kept, out of the drain), draining continued with the next op.
        #expect(harness.syncManager.queuedRows().map(\.type) == ["create_food"])
        #expect(harness.syncManager.parkedRows().map(\.type) == ["create_food"])
        #expect(harness.syncManager.parkedRows().first?.failureReason == "HTTP 400")
        #expect(harness.syncManager.pendingCount == 0)
        #expect(harness.syncManager.failedCount == 1)
        #expect(harness.syncManager.errors.count == 1)
        #expect(harness.syncManager.errors.first?.contains("HTTP 400") == true)
        #expect(harness.recordedRequests.contains("POST /api/goals"))
    }

    @Test("A duplicate-barcode 409 parks the edit with the other food's name")
    func duplicateBarcodeConflictParksWithReadableReason() async throws {
        let harness = try RepositoryHarness()
        harness.stub(
            "PATCH", "/api/foods/f1", status: 409,
            json: #"{"error": "A food with barcode 5449000169327 already exists: \"Coca-Cola Zero Zero\""}"#
        )
        try harness.context.insert(LocalFood(food: harness.food(id: "f1", name: "Cola")))
        try harness.context.save()

        harness.syncManager.enqueue(.updateFood(id: "f1", body: makeFoodCreate(name: "Cola")))
        await harness.syncManager.drainPendingQueue()

        let reason = L10n.syncBarcodeInUse(by: "Coca-Cola Zero Zero")
        #expect(harness.syncManager.parkedRows().first?.failureReason == reason)
        let banner = try #require(harness.syncManager.errors.first)
        #expect(banner.contains(reason))
        #expect(banner.contains("update food \"Cola\""))
        #expect(banner.contains("f1") == false)
    }

    @Test("409 bodies map to readable parked reasons")
    func conflictReasonMapping() {
        func body(_ json: String) -> Data? { json.data(using: .utf8) }
        #expect(SyncManager.conflictReason(body: body(#"{"error": "duplicate_barcode"}"#)) == L10n.syncBarcodeInUse)
        #expect(
            SyncManager.conflictReason(
                body: body(#"{"error": "A food with barcode 1 already exists: \"unknown\""}"#)
            ) == L10n.syncBarcodeInUse
        )
        #expect(
            SyncManager.conflictReason(body: body(#"{"error": "A food with barcode 1 already exists: \"Skyr\""}"#))
                == L10n.syncBarcodeInUse(by: "Skyr")
        )
        #expect(
            SyncManager.conflictReason(body: body(#"{"error": "Name already taken"}"#)) == "Name already taken"
        )
        #expect(SyncManager.conflictReason(body: body(#"{"error": "duplicate_entry"}"#)) == L10n.syncConflictGeneric)
        #expect(SyncManager.conflictReason(body: body("not json")) == L10n.syncConflictGeneric)
        #expect(SyncManager.conflictReason(body: nil) == L10n.syncConflictGeneric)
    }

    @Test("A parked op is not sent again until retried, and uploads once the server accepts it")
    func parkedOperationWaitsForRetry() async throws {
        let harness = try RepositoryHarness()
        harness.stub("POST", "/api/goals", status: 422, json: #"{"error": "invalid"}"#)

        harness.syncManager.enqueue(.setGoals(body: .defaults))
        await harness.syncManager.drainPendingQueue()
        await harness.syncManager.drainPendingQueue()

        #expect(harness.recordedRequests == ["POST /api/goals"])
        let parked = try #require(harness.syncManager.parkedRows().first)

        harness.stub("POST", "/api/goals", json: "{}")
        harness.syncManager.retryParked(parked)
        await harness.syncManager.drainPendingQueue()

        #expect(harness.recordedRequests == ["POST /api/goals", "POST /api/goals"])
        #expect(harness.syncManager.queuedRows().isEmpty)
        #expect(harness.syncManager.failedCount == 0)
    }

    @Test("Discarding deletes a parked op and never touches a live queued one")
    func discardParkedOnlyDeletesParkedRows() async throws {
        let harness = try RepositoryHarness()
        harness.stub("POST", "/api/goals", status: 400, json: #"{"error": "invalid"}"#)

        harness.syncManager.enqueue(.setGoals(body: .defaults))
        await harness.syncManager.drainPendingQueue()
        harness.syncManager.enqueue(.deleteFood(id: "f1", force: false))
        let live = try #require(harness.syncManager.queuedRows().first { $0.failedAt == nil })
        let parked = try #require(harness.syncManager.parkedRows().first)

        harness.syncManager.discardParked(live)
        #expect(harness.syncManager.queuedRows().count == 2)

        harness.syncManager.discardParked(parked)
        #expect(harness.syncManager.queuedRows().map(\.type) == ["delete_food"])
        #expect(harness.syncManager.failedCount == 0)
        #expect(harness.syncManager.pendingCount == 1)
    }

    @Test("Timeouts and rate limits back off instead of parking")
    func transientClientStatusesBackOff() async throws {
        for status in [408, 425, 429] {
            let harness = try RepositoryHarness()
            harness.stub("POST", "/api/goals", status: status, json: #"{"error": "slow down"}"#)

            harness.syncManager.enqueue(.setGoals(body: .defaults))
            await harness.syncManager.drainPendingQueue()

            #expect(harness.syncManager.parkedRows().isEmpty)
            #expect(harness.syncManager.queuedRows().first?.retryCount == 1)
        }
    }

    @Test("A create_entry 404 for a real foodId reports a missing reference, not a remote delete")
    func createEntry404WithRealFoodIdReportsReferenceMissing() async throws {
        let harness = try RepositoryHarness()
        harness.stub("POST", "/api/entries", status: 404, json: #"{"error": "Food not found"}"#)

        // The referenced foodId is a real (already-synced) server id, not a
        // `temp_` one — this can only be the server's ownership check failing
        // because the food was deleted before this offline create drained.
        harness.syncManager.enqueue(.createEntry(
            body: EntryCreate(foodId: "real-food-id", mealType: "lunch", servings: 1, date: "2026-06-01"),
            localId: LocalStore.makeTempId()
        ))

        let drained = await harness.syncManager.drainPendingQueue()

        // Parked, not deleted: the user's logged meal stays visible with the reason.
        #expect(drained == 0)
        #expect(harness.syncManager.parkedRows().count == 1)
        #expect(harness.syncManager.conflictNotices.first?.contains("no longer exists") == true)
        #expect(harness.syncManager.conflictNotices.first?.contains("deleted on another device") == false)
    }

    @Test("A create_entry 404 names the food and day, and reports it via onFoodReferenceMissing")
    func createEntry404NamesFoodAndReportsMissingReference() async throws {
        let harness = try RepositoryHarness()
        harness.stub("POST", "/api/entries", status: 404, json: #"{"error": "Food not found"}"#)
        // Seed the local food mirror so the notice can name it, mirroring what
        // the create's optimistic local row would already hold.
        try harness.context.insert(LocalFood(food: harness.food(id: "real-food-id", name: "Skyr")))
        try harness.context.save()

        var reportedMissingFoodIds: Set<String>?
        harness.syncManager.onFoodReferenceMissing = { reportedMissingFoodIds = $0 }

        harness.syncManager.enqueue(.createEntry(
            body: EntryCreate(foodId: "real-food-id", mealType: "lunch", servings: 1, date: "2026-06-01"),
            localId: LocalStore.makeTempId()
        ))

        let drained = await harness.syncManager.drainPendingQueue()

        #expect(drained == 0)
        #expect(harness.syncManager.parkedRows().count == 1)
        #expect(harness.syncManager.conflictNotices.first?.contains("Skyr") == true)
        #expect(harness.syncManager.conflictNotices.first?.contains("2026-06-01") == true)
        #expect(reportedMissingFoodIds == Set(["real-food-id"]))
    }

    @Test("A create_entry 404 for a foodId not in the local mirror falls back to generic wording")
    func createEntry404WithUncachedFoodFallsBackToGenericWording() async throws {
        let harness = try RepositoryHarness()
        harness.stub("POST", "/api/entries", status: 404, json: #"{"error": "Food not found"}"#)

        harness.syncManager.enqueue(.createEntry(
            body: EntryCreate(foodId: "uncached-food-id", mealType: "lunch", servings: 1, date: "2026-06-01"),
            localId: LocalStore.makeTempId()
        ))

        await harness.syncManager.drainPendingQueue()

        #expect(harness.syncManager.conflictNotices.first?.contains("that food") == true)
    }

    @Test("A 404 on a non-create op is still reported as deleted elsewhere")
    func nonCreateOp404StillReportsDeletedElsewhere() async throws {
        let harness = try RepositoryHarness()
        harness.stub("PATCH", "/api/weight/w1", status: 404, json: #"{"error": "not found"}"#)

        harness.syncManager.enqueue(.updateWeight(id: "w1", body: WeightUpdate(weightKg: 80)))

        let drained = await harness.syncManager.drainPendingQueue()

        #expect(drained == 1)
        #expect(harness.syncManager.queuedRows().isEmpty)
        #expect(harness.syncManager.conflictNotices.first?.contains("deleted on another device") == true)
    }

    @Test("5xx ends the drain so the ops behind it keep their retry count, and the op is retried indefinitely")
    func serverErrorEndsDrainAndNeverDrops() async throws {
        let harness = try RepositoryHarness()
        harness.stub("POST", "/api/foods", status: 500, json: #"{"error": "boom"}"#)
        harness.stub("POST", "/api/goals", json: "{}")

        harness.syncManager.enqueue(.createFood(body: makeFoodCreate(), localId: LocalStore.makeTempId()))
        harness.syncManager.enqueue(.setGoals(body: .defaults))

        // First drain: createFood is backed off (retryCount 1) and the drain ENDS.
        // setGoals is not attempted — a 5xx indicts the server, not the operation, so
        // pushing on would charge a retry to every queued op and five drains of a
        // one-minute outage would dead-letter the lot.
        await harness.syncManager.drainPendingQueue()
        #expect(harness.syncManager.queuedRows().map(\.type) == ["create_food", "set_goals"])
        #expect(harness.syncManager.queuedRows().first?.retryCount == 1)
        #expect(harness.syncManager.queuedRows().last?.retryCount == 0)
        #expect(!harness.recordedRequests.contains("POST /api/goals"))
        harness.syncManager.resetBackoffForTesting()

        // Attempts 2...12: createFood keeps failing and re-backing off, and the op behind
        // it keeps its untouched count. The old five-retry cap is gone — a one-minute deploy
        // restart or a long outage must never cost the user an offline-logged change.
        // Reset the backoff after each so the next drain picks it up without a real delay.
        for expectedRetry in 2 ... 12 {
            await harness.syncManager.drainPendingQueue()
            #expect(harness.syncManager.queuedRows().count == 2)
            #expect(harness.syncManager.queuedRows().first?.retryCount == expectedRetry)
            #expect(harness.syncManager.queuedRows().last?.retryCount == 0)
            #expect(harness.syncManager.parkedRows().isEmpty)
            harness.syncManager.resetBackoffForTesting()
        }
        #expect(harness.syncManager.errors.isEmpty)

        // The backoff is capped (5 minutes plus jitter), not exponential without bound.
        await harness.syncManager.drainPendingQueue()
        let gate = try #require(harness.syncManager.queuedRows().first?.nextAttemptAt)
        #expect(gate.timeIntervalSinceNow <= 5 * 60 + 1)
    }

    @Test("A 2xx create with an unreadable body is parked and does not stop the ops behind it")
    func unreadableCreateResponseIsParked() async throws {
        let harness = try RepositoryHarness()
        // 200 with a body this build cannot decode: the server already applied the create,
        // so retrying would only replay the same response. Park it so it stays visible.
        harness.stub("POST", "/api/foods", json: #"{"food": {"id": "f-server"}}"#)
        harness.stub("POST", "/api/goals", json: "{}")

        harness.syncManager.enqueue(.createFood(body: makeFoodCreate(), localId: LocalStore.makeTempId()))
        harness.syncManager.enqueue(.setGoals(body: .defaults))

        let drained = await harness.syncManager.drainPendingQueue()

        #expect(drained == 1)
        #expect(harness.syncManager.parkedRows().map(\.type) == ["create_food"])
        #expect(harness.syncManager.pendingCount == 0)
        #expect(harness.recordedRequests.contains("POST /api/goals"))
    }

    @Test("A 2xx non-create with an unreadable body counts as uploaded and leaves the queue")
    func unreadableUpdateResponseIsDropped() async throws {
        let harness = try RepositoryHarness()
        harness.stub("POST", "/api/goals", json: #"{"goals": "unreadable"}"#)

        harness.syncManager.enqueue(.setGoals(body: .defaults))
        let drained = await harness.syncManager.drainPendingQueue()

        #expect(drained == 1)
        #expect(harness.syncManager.queuedRows().isEmpty)
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

    @Test("Offline create chain: the queued entry create uploads the server food id")
    func offlineCreateChainRemapsQueuedEntryPayload() async throws {
        let harness = try RepositoryHarness(online: false)
        harness.stub("POST", "/api/foods", json: """
        {"food": {
            "id": "f-server", "userId": "u1", "name": "Skyr", "servingSize": 150, "servingUnit": "g",
            "calories": 98, "protein": 16, "carbs": 6, "fat": 0.2, "fiber": 0, "isFavorite": false
        }}
        """)
        harness.stub("POST", "/api/entries", json: """
        {"entry": {"id": "e-server", "userId": "u1", "date": "2026-06-01", "mealType": "lunch", "servings": 1}}
        """)

        // Offline: both creates queue up, nothing drains.
        let temp = try await harness.foodRepository.createFood(makeFoodCreate())
        _ = try await harness.entryRepository.createEntry(
            EntryCreate(foodId: temp.id, mealType: "lunch", servings: 1, date: "2026-06-01"),
            food: temp
        )
        #expect(harness.syncManager.queuedRows().count == 2)
        #expect(harness.recordedRequests.isEmpty)

        // Back online: the food create drains first and the queued entry
        // payload must be rewritten to the server food id before it uploads.
        harness.connectivity.isOnline = true
        let drained = await harness.syncManager.drainPendingQueue()

        #expect(drained == 2)
        let entryBody = try #require(harness.recordedBodies("POST", "/api/entries").first)
        let entryCreate = try JSONDecoder().decode(EntryCreate.self, from: entryBody)
        #expect(entryCreate.foodId == "f-server")
        #expect(harness.entryRepository.entries(date: "2026-06-01").first?.foodId == "f-server")
        #expect(harness.syncManager.queuedRows().isEmpty)
    }

    @Test("Offline create chain: queued recipe ingredients remap to the server food id")
    func offlineCreateChainRemapsQueuedRecipeIngredients() async throws {
        let harness = try RepositoryHarness(online: false)
        harness.stub("POST", "/api/foods", json: """
        {"food": {
            "id": "f-server", "userId": "u1", "name": "Skyr", "servingSize": 150, "servingUnit": "g",
            "calories": 98, "protein": 16, "carbs": 6, "fat": 0.2, "fiber": 0, "isFavorite": false
        }}
        """)
        harness.stub("POST", "/api/recipes", json: """
        {"recipe": {"id": "r-server", "userId": "u1", "name": "Bowl", "totalServings": 2, "isFavorite": false}}
        """)

        let temp = try await harness.foodRepository.createFood(makeFoodCreate())
        _ = try await harness.recipeRepository.createRecipe(RecipeCreate(
            name: "Bowl",
            totalServings: 2,
            ingredients: [RecipeIngredientInput(foodId: temp.id, quantity: 80, servingUnit: .g)]
        ))

        harness.connectivity.isOnline = true
        let drained = await harness.syncManager.drainPendingQueue()

        #expect(drained == 2)
        let recipeBody = try #require(harness.recordedBodies("POST", "/api/recipes").first)
        let recipeCreate = try JSONDecoder().decode(RecipeCreate.self, from: recipeBody)
        #expect(recipeCreate.ingredients.map(\.foodId) == ["f-server"])
        #expect(harness.syncManager.queuedRows().isEmpty)
    }

    @Test("Offline create chain: a queued supplement log remaps to the server supplement id")
    func offlineCreateChainRemapsQueuedSupplementLog() async throws {
        let harness = try RepositoryHarness(online: false)
        harness.stub("POST", "/api/supplements", json: """
        {"supplement": {
            "id": "s-server", "userId": "u1", "name": "Magnesium",
            "scheduleType": "daily", "isActive": true, "sortOrder": 0, "ingredients": []
        }}
        """)
        harness.stub("POST", "/api/supplements/s-server/log", json: """
        {"log": {"supplementId": "s-server", "date": "2026-06-01", "takenAt": "2026-06-01T08:00:00Z", "entryIds": []}}
        """)

        let temp = try await harness.supplementRepository.createSupplement(
            SupplementCreate(name: "Magnesium", scheduleType: .daily, ingredients: [])
        )
        try await harness.supplementRepository.logSupplement(id: temp.id, date: "2026-06-01")

        harness.connectivity.isOnline = true
        let drained = await harness.syncManager.drainPendingQueue()

        #expect(drained == 2)
        // The queued log was re-keyed: it POSTed against the server id.
        #expect(harness.recordedRequests == ["POST /api/supplements", "POST /api/supplements/s-server/log"])
        #expect(harness.syncManager.queuedRows().isEmpty)
    }

    @Test("A chained entry create waits for its still-backed-off food create instead of failing")
    func chainedEntryCreateWaitsForBackedOffFoodCreate() async throws {
        let harness = try RepositoryHarness()
        harness.stub("POST", "/api/foods", status: 500, json: #"{"error": "boom"}"#)
        // No /api/entries stub — an unstubbed request would 404, so the test
        // fails loudly if the entry create is (wrongly) attempted early.

        let tempFoodId = LocalStore.makeTempId()
        harness.syncManager.enqueue(.createFood(body: makeFoodCreate(), localId: tempFoodId))
        harness.syncManager.enqueue(.createEntry(
            body: EntryCreate(foodId: tempFoodId, mealType: "lunch", servings: 1, date: "2026-06-01"),
            localId: LocalStore.makeTempId()
        ))

        // Drain 1: the food create 500s, backs off (retryCount 1), and a
        // server-scoped failure ends the drain before it ever reaches the
        // entry create behind it.
        let firstDrain = await harness.syncManager.drainPendingQueue()
        #expect(firstDrain == 0)
        #expect(harness.recordedRequests == ["POST /api/foods"])
        #expect(harness.syncManager.queuedRows().map(\.type) == ["create_food", "create_entry"])
        #expect(harness.syncManager.queuedRows().first?.retryCount == 1)

        // Drain 2: `nextDueRow` now skips the backed-off food create, so the
        // entry create — still referencing its `temp_` foodId — becomes the
        // head of the queue. It must wait rather than upload a request that
        // can only fail (a `temp_` id is never valid UUID shape).
        let secondDrain = await harness.syncManager.drainPendingQueue()
        #expect(secondDrain == 0)
        #expect(harness.recordedRequests == ["POST /api/foods"])
        #expect(harness.syncManager.queuedRows().count == 2)
        #expect(harness.syncManager.queuedRows().last?.retryCount == 1)
        #expect(harness.syncManager.errors.isEmpty)
        #expect(harness.syncManager.conflictNotices.isEmpty)
    }

    @Test("A chained entry create is parked along with the parked food create it depends on")
    func chainedEntryCreateParksWithParkedFoodCreate() async throws {
        let harness = try RepositoryHarness()
        harness.stub("POST", "/api/foods", status: 400, json: #"{"error": "invalid"}"#)
        // No /api/entries stub: the entry create must never be attempted —
        // its referenced food was never created, so there is nothing to POST.

        let tempFoodId = LocalStore.makeTempId()
        harness.syncManager.enqueue(.createFood(body: makeFoodCreate(), localId: tempFoodId))
        harness.syncManager.enqueue(.createEntry(
            body: EntryCreate(foodId: tempFoodId, mealType: "lunch", servings: 1, date: "2026-06-01"),
            localId: LocalStore.makeTempId()
        ))

        // The food create 400s and is parked; the entry create right behind it
        // depends on a create that will not resolve until the user retries it,
        // so it is parked too instead of waiting forever, and never hits the network.
        let drained = await harness.syncManager.drainPendingQueue()
        #expect(drained == 0)
        #expect(harness.syncManager.parkedRows().map(\.type) == ["create_food", "create_entry"])
        #expect(harness.syncManager.pendingCount == 0)
        #expect(harness.recordedRequests == ["POST /api/foods"])
        #expect(harness.syncManager.hasPending(table: "foods") == false)
        #expect(harness.syncManager.pendingAffectedIds(table: "foods").isEmpty)

        // Discarding the food create leaves nothing to resolve the reference.
        harness.syncManager.discardParked(try #require(harness.syncManager.parkedRows().first))
        harness.syncManager.retryParked(try #require(harness.syncManager.parkedRows().first))
        harness.syncManager.resetBackoffForTesting()
        await harness.syncManager.drainPendingQueue()
        #expect(harness.syncManager.parkedRows().map(\.type) == ["create_entry"])
        #expect(harness.syncManager.pendingCount == 0)
        #expect(harness.recordedRequests == ["POST /api/foods"])
    }

    @Test("A parked update does not hold back server refreshes for its table")
    func parkedUpdateDoesNotBlockRefresh() async throws {
        let harness = try RepositoryHarness()
        harness.stub("POST", "/api/goals", status: 400, json: #"{"error": "invalid"}"#)

        harness.syncManager.enqueue(.setGoals(body: .defaults))
        #expect(harness.syncManager.hasPending(table: "goals"))

        await harness.syncManager.drainPendingQueue()
        #expect(harness.syncManager.parkedRows().count == 1)
        #expect(harness.syncManager.hasPending(table: "goals") == false)
    }

    @Test("Connectivity failures stop draining without consuming the retry budget")
    func connectivityFailureDoesNotConsumeRetries() async throws {
        let harness = try RepositoryHarness()
        // The connectivity monitor still reports the optimistic online default,
        // but the request fails at the transport level (offline launch).
        harness.stubError("POST", "/api/goals", code: .notConnectedToInternet)

        harness.syncManager.enqueue(.setGoals(body: .defaults))
        for _ in 0 ..< 6 {
            await harness.syncManager.drainPendingQueue()
        }

        // Still queued, with an untouched retry budget.
        #expect(harness.syncManager.queuedRows().count == 1)
        #expect(harness.syncManager.queuedRows().first?.retryCount == 0)

        // Once the connection is back the op uploads normally.
        harness.stub("POST", "/api/goals", json: "{}")
        let drained = await harness.syncManager.drainPendingQueue()
        #expect(drained == 1)
        #expect(harness.syncManager.queuedRows().isEmpty)
    }

    @Test("Operations enqueued during an active drain are uploaded by that drain")
    func opsEnqueuedDuringDrainAreProcessed() async throws {
        let harness = try RepositoryHarness()
        harness.stub("POST", "/api/goals", json: "{}", delayMs: 500)
        harness.stub("DELETE", "/api/foods/f1", json: "{}")

        harness.syncManager.enqueue(.setGoals(body: .defaults))
        let drainTask = Task { await harness.syncManager.drainPendingQueue() }
        // Let the drain start and suspend on the delayed response, then
        // enqueue another op mid-drain (its scheduleDrain is a no-op here).
        try await Task.sleep(for: .milliseconds(100))
        harness.syncManager.enqueue(.deleteFood(id: "f1", force: false))

        let drained = await drainTask.value

        #expect(drained == 2)
        #expect(harness.syncManager.queuedRows().isEmpty)
        #expect(harness.recordedRequests == ["POST /api/goals", "DELETE /api/foods/f1"])
    }

    @Test("A queued delete drains successfully against a real 204 empty body")
    func deleteAgainstEmpty204Succeeds() async throws {
        let harness = try RepositoryHarness()
        // A genuine No Content response: status 204 with a 0-byte body — exactly
        // what every server DELETE returns. Regression guard for the decode that
        // used to throw "Unexpected end of file" and dead-letter every delete
        // (the prior tests stubbed `{}`, a 2-byte body that decodes fine and hid
        // the bug).
        harness.stub("DELETE", "/api/foods/f1", status: 204, json: "")

        harness.syncManager.enqueue(.deleteFood(id: "f1", force: false))
        let drained = await harness.syncManager.drainPendingQueue()

        #expect(drained == 1)
        #expect(harness.syncManager.queuedRows().isEmpty)
        #expect(harness.syncManager.errors.isEmpty)
    }

    @Test("Deleting a temp row while its create is in flight does not resurrect it")
    func deleteDuringInFlightCreateDoesNotResurrect() async throws {
        let harness = try RepositoryHarness()
        harness.stub("POST", "/api/foods", json: """
        {"food": {
            "id": "f-server", "userId": "u1", "name": "Skyr", "servingSize": 150, "servingUnit": "g",
            "calories": 98, "protein": 16, "carbs": 6, "fat": 0.2, "fiber": 0, "isFavorite": false
        }}
        """, delayMs: 500)
        harness.stub("DELETE", "/api/foods/f-server", json: "{}")

        let temp = try await harness.foodRepository.createFood(makeFoodCreate())
        let drainTask = Task { await harness.syncManager.drainPendingQueue() }
        // Delete the temp row while the POST is in flight.
        try await Task.sleep(for: .milliseconds(100))
        try await harness.foodRepository.deleteFood(id: temp.id)

        _ = await drainTask.value

        // The server record is not re-inserted locally; instead its deletion
        // was enqueued and drained.
        #expect(harness.foodRepository.food(id: "f-server") == nil)
        #expect(harness.foodRepository.searchLocal("Skyr").isEmpty)
        #expect(harness.recordedRequests == ["POST /api/foods", "DELETE /api/foods/f-server"])
        #expect(harness.syncManager.queuedRows().isEmpty)
    }

    @Test("Queue survives across manager instances (persisted in the store)")
    func queuePersistsInStore() throws {
        let harness = try RepositoryHarness()
        harness.syncManager.enqueue(.deleteFood(id: "f1", force: false))
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

    // MARK: - completeAiTask

    @Test("A successful completeAiTask uploads the resolved entry ids and clears the queue")
    func completeAiTaskUploadsSuccessfully() async throws {
        let harness = try RepositoryHarness()
        harness.stub("PATCH", "/api/ai-tasks/task-1", json: """
        {"task": {"id": "task-1", "userId": "u1", "status": "completed", "photoUrls": [], "date": "2026-06-01"}}
        """)

        harness.syncManager.enqueue(.completeAiTask(
            taskId: "task-1", localEntryIds: ["e1", "e2"], resultSummary: "Logged egg, toast",
            processedBy: "on_device", clientEditedAt: "2026-06-01T08:00:00Z"
        ))

        let drained = await harness.syncManager.drainPendingQueue()

        #expect(drained == 1)
        #expect(harness.syncManager.queuedRows().isEmpty)
        #expect(harness.syncManager.conflictNotices.isEmpty)
        let body = try #require(harness.recordedBodies("PATCH", "/api/ai-tasks/task-1").first)
        let update = try JSONDecoder().decode(AiTaskUpdate.self, from: body)
        #expect(update.status == "completed")
        #expect(update.createdEntryIds == ["e1", "e2"])
    }

    @Test("A completeAiTask conflict is forced through unconditionally instead of dropped")
    func completeAiTaskConflictForcesThroughOnRetry() async throws {
        let harness = try RepositoryHarness()
        // The task was edited on another device between the caller's last
        // freshness check and this upload landing — the first (guarded)
        // attempt loses the LWW race; the forced retry it triggers has no
        // guard to lose.
        harness.stubSequence("PATCH", "/api/ai-tasks/task-1", [
            (status: 409, json: #"{"error": "conflict_server_newer"}"#, headers: ["X-Sync-Conflict": "server-newer"]),
            (
                status: 200,
                json: #"{"task": {"id": "task-1", "userId": "u1", "status": "completed", "photoUrls": [], "date": "2026-06-01"}}"#,
                headers: [:]
            ),
        ])

        harness.syncManager.enqueue(.completeAiTask(
            taskId: "task-1", localEntryIds: ["e1"], resultSummary: "Logged egg",
            processedBy: "on_device", clientEditedAt: "2026-06-01T08:00:00Z"
        ))

        let drained = await harness.syncManager.drainPendingQueue()

        #expect(drained == 1)
        #expect(harness.syncManager.queuedRows().isEmpty)
        #expect(harness.recordedRequests == ["PATCH /api/ai-tasks/task-1", "PATCH /api/ai-tasks/task-1"])
        #expect(harness.syncManager.errors.isEmpty)
        // Forced through silently — this is a resolution, not a lost edit the
        // user needs to be told about.
        #expect(harness.syncManager.conflictNotices.isEmpty)
    }

    @Test("A persistently conflicting completeAiTask is still dropped, not stuck forever")
    func completeAiTaskPersistentConflictStillDrops() async throws {
        let harness = try RepositoryHarness()
        // Every attempt — guarded or forced — hits the same conflict, as it
        // would if the task were, say, deleted on another device instead.
        harness.stub(
            "PATCH", "/api/ai-tasks/task-1",
            status: 409, json: #"{"error": "conflict_server_newer"}"#,
            headers: ["X-Sync-Conflict": "server-newer"]
        )

        harness.syncManager.enqueue(.completeAiTask(
            taskId: "task-1", localEntryIds: ["e1"], resultSummary: "Logged egg",
            processedBy: "on_device", clientEditedAt: "2026-06-01T08:00:00Z"
        ))

        let drained = await harness.syncManager.drainPendingQueue()

        #expect(drained == 1)
        #expect(harness.syncManager.queuedRows().isEmpty)
        #expect(harness.recordedRequests == ["PATCH /api/ai-tasks/task-1", "PATCH /api/ai-tasks/task-1"])
        #expect(harness.syncManager.conflictNotices.count == 1)
    }

    @Test("A completeAiTask without a clientEditedAt snapshot never retries unconditionally")
    func completeAiTaskWithoutClientEditedAtDoesNotForceRetry() async throws {
        let harness = try RepositoryHarness()
        // Contrived: with no clientEditedAt sent, the server's own LWW guard
        // never applies and a real backend could not actually answer this —
        // this only pins down the client-side guard clause (`snapshotClientEditedAt
        // != nil`) in isolation from `serverNewer`, which the other two tests
        // above already cover.
        harness.stub(
            "PATCH", "/api/ai-tasks/task-1",
            status: 409, json: #"{"error": "conflict_server_newer"}"#,
            headers: ["X-Sync-Conflict": "server-newer"]
        )

        harness.syncManager.enqueue(.completeAiTask(
            taskId: "task-1", localEntryIds: ["e1"], resultSummary: "Logged egg",
            processedBy: "on_device", clientEditedAt: nil
        ))

        let drained = await harness.syncManager.drainPendingQueue()

        // Falls back to the generic conflict handling — dropped + noted —
        // exactly like any other op's LWW loss, in a single request.
        #expect(drained == 1)
        #expect(harness.syncManager.queuedRows().isEmpty)
        #expect(harness.recordedRequests == ["PATCH /api/ai-tasks/task-1"])
        #expect(harness.syncManager.conflictNotices.count == 1)
    }
}
