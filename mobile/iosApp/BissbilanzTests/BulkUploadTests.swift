@testable import Bissbilanz
import Foundation
import SwiftData
import Testing

final class UploadImageRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private var files: [String: Data] = [:]
    private var moved: [(local: String, server: String)] = []

    func put(_ url: String, _ data: Data) {
        lock.lock()
        defer { lock.unlock() }
        files[url] = data
    }

    var adopted: [(local: String, server: String)] {
        lock.lock()
        defer { lock.unlock() }
        return moved
    }

    var io: BulkImageIO {
        BulkImageIO(
            read: { url in
                self.lock.lock()
                defer { self.lock.unlock() }
                return self.files[url]
            },
            adopt: { local, server in
                self.lock.lock()
                defer { self.lock.unlock() }
                self.moved.append((local, server))
            }
        )
    }
}

final class DelayRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private var recorded: [TimeInterval] = []

    func record(_ seconds: TimeInterval) {
        lock.lock()
        defer { lock.unlock() }
        recorded.append(seconds)
    }

    var values: [TimeInterval] {
        lock.lock()
        defer { lock.unlock() }
        return recorded
    }
}

/// The in-memory store, a stubbed API and a `BulkUploadManager` wired to them. Photos and
/// waiting are recorded instead of touching the disk and the clock.
@MainActor
private struct UploadFixture {
    let harness: RepositoryHarness
    let manager: BulkUploadManager
    let images = UploadImageRecorder()
    let delays = DelayRecorder()
    let userId = "user-1"
    static let path = "/api/foods/bulk"

    init(signedInAs signedIn: String? = "user-1", online: Bool = true) throws {
        harness = try RepositoryHarness(online: online)
        let images = images
        let delays = delays
        manager = BulkUploadManager(
            container: harness.container,
            api: harness.api,
            appMode: harness.appMode,
            connectivity: harness.connectivity,
            currentUserId: { signedIn },
            defaults: harness.defaults,
            imageIO: images.io,
            delay: { delays.record($0) }
        )
        manager.autoStart = false
    }

    nonisolated static func id(_ number: Int) -> String {
        String(format: "00000000-0000-4000-8000-%012d", number)
    }

    func ids(_ range: Range<Int>) -> [String] {
        range.map { Self.id($0) }
    }

    /// Foods `range` with a job each, the oldest first.
    func seed(
        _ range: Range<Int>, user: String? = nil, imageUrl: String? = nil, barcode: String? = nil
    ) throws {
        for number in range {
            var food = try harness.food(id: Self.id(number), name: "Food \(number)", barcode: barcode.map { "\($0)\(number)" })
            if let imageUrl {
                food = try JSONPatch.merged(Food.self, base: food, patch: ["imageUrl": imageUrl])
            }
            harness.context.insert(LocalFood(food: food))
            let job = BulkUploadJob(userId: user ?? userId, foodId: Self.id(number))
            job.createdAt = Date(timeIntervalSince1970: 1_800_000_000 + Double(number))
            harness.context.insert(job)
        }
        try harness.context.save()
    }

    func freshContext() -> ModelContext {
        ModelContext(harness.container)
    }

    func jobs() throws -> [BulkUploadJob] {
        try freshContext().fetch(FetchDescriptor<BulkUploadJob>(sortBy: [SortDescriptor(\.createdAt)]))
    }

    func food(_ number: Int) throws -> LocalFood? {
        let id = Self.id(number)
        return try freshContext().fetch(FetchDescriptor<LocalFood>(predicate: #Predicate { $0.id == id })).first
    }

    func response(_ ids: [String], status: String = "created") -> String {
        let items = ids.map { #"{"id":"\#($0)","status":"\#(status)"}"# }
        return #"{"results":[\#(items.joined(separator: ","))]}"#
    }

    var bodies: [Data] {
        harness.recordedBodies("POST", Self.path)
    }

    /// The foods part of a request body.
    func sentFoods(_ body: Data) throws -> [[String: Any]] {
        let text = String(decoding: body, as: UTF8.self)
        let marker = "name=\"foods\"\r\nContent-Type: application/json\r\n\r\n"
        let start = try #require(text.range(of: marker)).upperBound
        let end = try #require(text.range(of: "\r\n--Boundary-", range: start ..< text.endIndex)).lowerBound
        return try #require(JSONSerialization.jsonObject(with: Data(text[start ..< end].utf8)) as? [[String: Any]])
    }
}

@Suite("Bulk upload")
@MainActor
struct BulkUploadTests {
    // MARK: - Draining

    @Test("Sends the foods 200 at a time, oldest first, and paces the requests under the rate limit")
    func batchesAndPaces() async throws {
        let fixture = try UploadFixture()
        try fixture.seed(0 ..< 450)
        fixture.harness.stubSequence("POST", UploadFixture.path, [
            (status: 200, json: fixture.response(fixture.ids(0 ..< 200)), headers: [:]),
            (status: 200, json: fixture.response(fixture.ids(200 ..< 400)), headers: [:]),
            (status: 200, json: fixture.response(fixture.ids(400 ..< 450)), headers: [:]),
        ])

        await fixture.manager.drain()

        let bodies = fixture.bodies
        #expect(bodies.count == 3)
        let first = try fixture.sentFoods(bodies[0])
        #expect(first.count == 200)
        #expect(first.first?["id"] as? String == UploadFixture.id(0))
        #expect(first.last?["id"] as? String == UploadFixture.id(199))
        #expect(try fixture.sentFoods(bodies[2]).count == 50)
        #expect(try fixture.jobs().isEmpty)
        #expect(fixture.manager.pendingCount == 0)
        #expect(fixture.manager.total == 0)
        // Back-to-back requests wait out the rest of the 2.1 s spacing between them.
        let waits = fixture.delays.values
        #expect(!waits.isEmpty && waits.count <= 2)
        #expect(waits.allSatisfy { $0 > 0 && $0 <= BulkUploadManager.minRequestInterval })
    }

    @Test("Sends each food's fields with its client id and labels, and no owner or local photo URL")
    func requestBodyShape() async throws {
        let fixture = try UploadFixture()
        try fixture.seed(0 ..< 1, imageUrl: "file:///memory/local-a.webp", barcode: "7612")
        fixture.images.put("file:///memory/local-a.webp", Data([1, 2, 3, 4]))
        fixture.harness.stub("POST", UploadFixture.path, json: fixture.response(fixture.ids(0 ..< 1)))

        await fixture.manager.drain()

        let body = try #require(fixture.bodies.first)
        let item = try #require(fixture.sentFoods(body).first)
        #expect(item["id"] as? String == UploadFixture.id(0))
        #expect(item["name"] as? String == "Food 0")
        #expect(item["barcode"] as? String == "76120")
        #expect(item["imageUrl"] == nil)
        #expect(item["userId"] == nil)
        #expect(item["createdAt"] == nil)
        let text = String(decoding: body, as: UTF8.self)
        #expect(text.contains("name=\"image.\(UploadFixture.id(0))\"; filename=\"\(UploadFixture.id(0)).webp\""))
        #expect(text.contains("Content-Type: image/webp"))
        let headers = try #require(fixture.harness.recordedHeaders("POST", UploadFixture.path).first)
        #expect(headers["Origin"] == fixture.harness.baseURL)
        #expect(headers["Content-Type"]?.hasPrefix("multipart/form-data; boundary=Boundary-") == true)
    }

    @Test("A food created with its photo takes the server's URL, and the local file is adopted")
    func writesBackTheServerImage() async throws {
        let fixture = try UploadFixture()
        try fixture.seed(0 ..< 1, imageUrl: "file:///memory/local-a.webp")
        fixture.images.put("file:///memory/local-a.webp", Data([1, 2, 3]))
        fixture.harness.stub("POST", UploadFixture.path, json: """
        {"results":[{"id":"\(UploadFixture.id(0))","status":"created","imageUrl":"/uploads/abc.webp"}]}
        """)

        await fixture.manager.drain()

        #expect(try fixture.jobs().isEmpty)
        #expect(try fixture.food(0)?.toFood()?.imageUrl == "/uploads/abc.webp")
        #expect(fixture.images.adopted.map { $0.local } == ["file:///memory/local-a.webp"])
        #expect(fixture.images.adopted.map { $0.server } == ["/uploads/abc.webp"])
    }

    @Test("A photo over the route's limit is left out of the request and stays on the device")
    func oversizedPhotoStaysLocal() async throws {
        let fixture = try UploadFixture()
        try fixture.seed(0 ..< 1, imageUrl: "file:///memory/big.webp")
        fixture.images.put("file:///memory/big.webp", Data(count: BulkUploadStore.maxImageBytes + 1))
        fixture.harness.stub("POST", UploadFixture.path, json: fixture.response(fixture.ids(0 ..< 1)))

        await fixture.manager.drain()

        let body = try #require(fixture.bodies.first)
        #expect(!String(decoding: body, as: UTF8.self).contains("name=\"image."))
        #expect(try fixture.food(0)?.toFood()?.imageUrl == "file:///memory/big.webp")
        #expect(try fixture.jobs().isEmpty)
    }

    @Test("A rate limit waits for the server's Retry-After and then carries on")
    func honoursRetryAfter() async throws {
        let fixture = try UploadFixture()
        try fixture.seed(0 ..< 3)
        fixture.harness.stubSequence("POST", UploadFixture.path, [
            (status: 429, json: "{}", headers: ["Retry-After": "7"]),
            (status: 200, json: fixture.response(fixture.ids(0 ..< 3)), headers: [:]),
        ])

        await fixture.manager.drain()

        #expect(fixture.bodies.count == 2)
        #expect(fixture.delays.values.contains(7))
        #expect(try fixture.jobs().isEmpty)
        #expect(fixture.manager.rateLimitedUntil == nil)
    }

    @Test("A 429 without Retry-After backs off a minute")
    func defaultRetryAfter() async throws {
        let fixture = try UploadFixture()
        fixture.harness.stub("POST", UploadFixture.path, status: 429, json: "{}")
        await #expect(throws: BulkUploadError.rateLimited(retryAfter: 60)) {
            try await fixture.harness.api.postBulkFoods(body: Data("x".utf8), boundary: "b")
        }
    }

    @Test("Server errors back off exponentially, stop after a few, and leave every job pending")
    func backsOffOnServerErrors() async throws {
        let fixture = try UploadFixture()
        try fixture.seed(0 ..< 5)
        fixture.harness.stub("POST", UploadFixture.path, status: 503, json: #"{"error":"down"}"#)

        await fixture.manager.drain()

        #expect(fixture.bodies.count == BulkUploadManager.maxTransientFailures)
        let waits = fixture.delays.values
        #expect(waits.contains(5) && waits.contains(10) && waits.contains(20))
        #expect(try fixture.jobs().count == 5)
        #expect(try fixture.jobs().allSatisfy { $0.state == BulkUploadJob.pendingState && $0.attempts == 0 })
        #expect(fixture.manager.lastError != nil)
        #expect(fixture.manager.pendingCount == 5)
    }

    @Test("A connection failure counts as transient too")
    func backsOffOnNetworkErrors() async throws {
        let fixture = try UploadFixture()
        try fixture.seed(0 ..< 2)
        fixture.harness.stubError("POST", UploadFixture.path, code: .notConnectedToInternet)

        await fixture.manager.drain()

        #expect(fixture.bodies.count == BulkUploadManager.maxTransientFailures)
        #expect(try fixture.jobs().count == 2)
    }

    @Test("A request the server rejects whole uses an attempt on each food and parks them at the limit")
    func parksAfterRepeatedRejections() async throws {
        let fixture = try UploadFixture()
        try fixture.seed(0 ..< 3)
        fixture.harness.stub("POST", UploadFixture.path, status: 400, json: #"{"error":"bad"}"#)

        await fixture.manager.drain()
        #expect(fixture.bodies.count == BulkUploadManager.maxBatchFailures)
        #expect(try fixture.jobs().map(\.attempts) == [3, 3, 3])

        await fixture.manager.drain()
        #expect(try fixture.jobs().allSatisfy { $0.state == BulkUploadJob.failedState && $0.attempts == 5 })
        #expect(fixture.manager.failedCount == 3)
        #expect(fixture.manager.pendingCount == 0)
        #expect(fixture.manager.hasWork)
    }

    @Test("Retrying failed foods puts them back in the queue")
    func retryFailed() async throws {
        let fixture = try UploadFixture()
        try fixture.seed(0 ..< 2)
        let jobs = try fixture.harness.context.fetch(FetchDescriptor<BulkUploadJob>())
        for job in jobs {
            job.state = BulkUploadJob.failedState
            job.attempts = 5
            job.lastError = "no"
        }
        try fixture.harness.context.save()
        let store = BulkUploadStore(modelContainer: fixture.harness.container)

        let count = try await store.retryFailed(userId: fixture.userId)

        #expect(count == 2)
        #expect(try fixture.jobs().allSatisfy { $0.state == BulkUploadJob.pendingState && $0.attempts == 0 && $0.lastError == nil })
    }

    // MARK: - What stops an upload

    @Test("Paused, offline, cellular with Wi-Fi only, signed out: no request is sent")
    func gates() async throws {
        let paused = try UploadFixture()
        try paused.seed(0 ..< 2)
        paused.manager.pause()
        await paused.manager.drain()
        #expect(paused.bodies.isEmpty)

        let offline = try UploadFixture(online: false)
        try offline.seed(0 ..< 2)
        await offline.manager.drain()
        #expect(offline.bodies.isEmpty)

        let cellular = try UploadFixture()
        try cellular.seed(0 ..< 2)
        cellular.manager.wifiOnly = true
        cellular.harness.connectivity.isExpensive = true
        await cellular.manager.drain()
        #expect(cellular.bodies.isEmpty)

        let signedOut = try UploadFixture(signedInAs: nil)
        try signedOut.seed(0 ..< 2)
        await signedOut.manager.drain()
        #expect(signedOut.bodies.isEmpty)
    }

    @Test("Resuming after a pause uploads, and the choices persist")
    func pauseResumeAndPersistence() async throws {
        let fixture = try UploadFixture()
        try fixture.seed(0 ..< 2)
        fixture.harness.stub("POST", UploadFixture.path, json: fixture.response(fixture.ids(0 ..< 2)))
        fixture.manager.pause()
        fixture.manager.wifiOnly = true
        #expect(fixture.harness.defaults.bool(forKey: BulkUploadState.pausedKey))
        #expect(fixture.harness.defaults.bool(forKey: BulkUploadState.wifiOnlyKey))

        fixture.manager.isPaused = false
        fixture.manager.wifiOnly = false
        await fixture.manager.drain()

        #expect(fixture.bodies.count == 1)
        #expect(!fixture.harness.defaults.bool(forKey: BulkUploadState.pausedKey))
    }

    @Test("Another account's jobs are discarded together with their foods, never sent")
    func foreignJobsAreDiscarded() async throws {
        let fixture = try UploadFixture()
        try fixture.seed(0 ..< 2, user: "someone-else")
        try fixture.seed(2 ..< 3)
        fixture.harness.stub("POST", UploadFixture.path, json: fixture.response(fixture.ids(2 ..< 3)))

        await fixture.manager.drain()

        let body = try #require(fixture.bodies.first)
        #expect(try fixture.sentFoods(body).map { $0["id"] as? String } == [UploadFixture.id(2)])
        #expect(try fixture.food(0) == nil)
        #expect(try fixture.food(1) == nil)
        #expect(try fixture.food(2) != nil)
        #expect(try fixture.jobs().isEmpty)
    }

    @Test("A food deleted before its turn is dropped from the queue, not resurrected on the server")
    func deletedFoodsAreNotUploaded() async throws {
        let fixture = try UploadFixture()
        try fixture.seed(0 ..< 3)
        let doomed = try #require(fixture.harness.context.fetch(FetchDescriptor<LocalFood>(
            predicate: #Predicate { $0.name == "Food 1" }
        )).first)
        fixture.harness.context.delete(doomed)
        try fixture.harness.context.save()
        fixture.harness.stub("POST", UploadFixture.path, json: fixture.response([UploadFixture.id(0), UploadFixture.id(2)]))

        await fixture.manager.drain()

        let body = try #require(fixture.bodies.first)
        #expect(try fixture.sentFoods(body).compactMap { $0["id"] as? String } == [UploadFixture.id(0), UploadFixture.id(2)])
        #expect(try fixture.jobs().isEmpty)
    }

    // MARK: - Statuses

    @Test("Each status is handled: uploaded, retried without the barcode, re-keyed, parked, retried")
    func statusPaths() async throws {
        let fixture = try UploadFixture()
        try fixture.seed(0 ..< 6, barcode: "76")
        let entry = try fixture.harness.entry(id: "entry-1", date: "2026-10-06", foodId: UploadFixture.id(3))
        fixture.harness.context.insert(LocalEntry(entry: entry, date: "2026-10-06"))
        try fixture.harness.context.save()
        let store = BulkUploadStore(modelContainer: fixture.harness.container)

        let request = try #require(try await store.prepareBatch(userId: fixture.userId, imageIO: fixture.images.io))
        #expect(request.foodIds == fixture.ids(0 ..< 6))
        let results = [
            BulkFoodResult(id: UploadFixture.id(0), status: "created", imageUrl: nil, message: nil),
            BulkFoodResult(id: UploadFixture.id(1), status: "exists", imageUrl: nil, message: nil),
            BulkFoodResult(id: UploadFixture.id(2), status: "duplicate_barcode", imageUrl: nil, message: nil),
            BulkFoodResult(id: UploadFixture.id(3), status: "id_conflict", imageUrl: nil, message: nil),
            BulkFoodResult(id: UploadFixture.id(4), status: "invalid", imageUrl: nil, message: "servingSize: Too small"),
            BulkFoodResult(id: UploadFixture.id(5), status: "surprise", imageUrl: nil, message: nil),
        ]

        let outcome = try await store.apply(results, to: request, imageIO: fixture.images.io)

        #expect(outcome.uploaded == 2)
        #expect(outcome.requeued == 3)
        #expect(outcome.failed == 1)
        let jobs = try fixture.jobs()
        #expect(jobs.count == 4)
        let barcodeJob = try #require(jobs.first { $0.foodId == UploadFixture.id(2) })
        #expect(barcodeJob.dropBarcode)
        #expect(barcodeJob.state == BulkUploadJob.pendingState)
        let invalidJob = try #require(jobs.first { $0.foodId == UploadFixture.id(4) })
        #expect(invalidJob.state == BulkUploadJob.failedState)
        #expect(invalidJob.lastError == "servingSize: Too small")
        let unknownJob = try #require(jobs.first { $0.foodId == UploadFixture.id(5) })
        #expect(unknownJob.attempts == 1 && unknownJob.state == BulkUploadJob.pendingState)

        // The conflicting id was replaced everywhere it appears on the device.
        let rekeyed = try #require(jobs.first { $0.foodId != UploadFixture.id(2) && $0.foodId != UploadFixture.id(4) && $0.foodId != UploadFixture.id(5) })
        #expect(rekeyed.foodId == rekeyed.foodId.lowercased())
        #expect(try fixture.food(3) == nil)
        let context = fixture.freshContext()
        let newId = rekeyed.foodId
        let row = try #require(context.fetch(FetchDescriptor<LocalFood>(predicate: #Predicate { $0.id == newId })).first)
        #expect(row.toFood()?.id == newId)
        let entryRow = try #require(context.fetch(FetchDescriptor<LocalEntry>()).first)
        #expect(entryRow.foodId == newId)
        #expect(entryRow.toEntry()?.foodId == newId)

        // The retry leaves the taken barcode out.
        let retry = try #require(try await store.prepareBatch(userId: fixture.userId, imageIO: fixture.images.io))
        let sent = try fixture.sentFoods(retry.body)
        let withoutBarcode = try #require(sent.first { $0["id"] as? String == UploadFixture.id(2) })
        #expect(withoutBarcode["barcode"] == nil)
        let withBarcode = try #require(sent.first { $0["id"] as? String == UploadFixture.id(5) })
        #expect(withBarcode["barcode"] as? String == "765")
    }

    @Test("A food created without its photo is counted, and the food is still uploaded")
    func photoDroppedByServer() async throws {
        let fixture = try UploadFixture()
        try fixture.seed(0 ..< 1)
        let store = BulkUploadStore(modelContainer: fixture.harness.container)
        let request = try #require(try await store.prepareBatch(userId: fixture.userId, imageIO: fixture.images.io))

        let outcome = try await store.apply(
            [BulkFoodResult(id: UploadFixture.id(0), status: "created", imageUrl: nil, message: "image_too_large")],
            to: request, imageIO: fixture.images.io
        )

        #expect(outcome.uploaded == 1)
        #expect(outcome.imagesDropped == 1)
        #expect(try fixture.jobs().isEmpty)
    }

    @Test("A request that came back without a result for a food leaves it queued with an attempt used")
    func missingResult() async throws {
        let fixture = try UploadFixture()
        try fixture.seed(0 ..< 2)
        let store = BulkUploadStore(modelContainer: fixture.harness.container)
        let request = try #require(try await store.prepareBatch(userId: fixture.userId, imageIO: fixture.images.io))

        let outcome = try await store.apply(
            [BulkFoodResult(id: UploadFixture.id(0), status: "created", imageUrl: nil, message: nil)],
            to: request, imageIO: fixture.images.io
        )

        #expect(outcome.uploaded == 1)
        #expect(outcome.requeued == 1)
        #expect(try fixture.jobs().map(\.attempts) == [1])
    }

    @Test("A priority job goes to the front of the next request")
    func priorityGoesFirst() async throws {
        let fixture = try UploadFixture()
        try fixture.seed(0 ..< 5)
        let store = BulkUploadStore(modelContainer: fixture.harness.container)
        try await store.prioritize(foodIds: [UploadFixture.id(4)])

        let request = try #require(try await store.prepareBatch(userId: fixture.userId, imageIO: fixture.images.io, maxItems: 2))

        #expect(request.foodIds == [UploadFixture.id(4), UploadFixture.id(0)])
    }

    @Test("A request stops growing past its byte budget but always carries at least one food")
    func byteBudget() async throws {
        let fixture = try UploadFixture()
        try fixture.seed(0 ..< 4)
        let store = BulkUploadStore(modelContainer: fixture.harness.container)

        let request = try #require(try await store.prepareBatch(userId: fixture.userId, imageIO: fixture.images.io, maxBytes: 1))

        #expect(request.foodIds.count == 1)
    }

    // MARK: - Sync queue and mirror

    @Test("isAwaitingUpload is true for a pending imported food, and moves it up the line")
    func awaitingUpload() async throws {
        let fixture = try UploadFixture()
        try fixture.seed(0 ..< 2)
        await fixture.manager.noteImported(count: 2)
        fixture.manager.pause()

        #expect(fixture.manager.isAwaitingUpload(foodId: UploadFixture.id(1)))
        #expect(!fixture.manager.isAwaitingUpload(foodId: "not-imported"))
        let prioritized = try fixture.jobs().first { $0.foodId == UploadFixture.id(1) }
        #expect(prioritized?.priority == 1)
    }

    @Test("The sync queue holds back an operation on an imported food that is not on the server yet")
    func syncQueueDefersOperations() async throws {
        let harness = try RepositoryHarness()
        let foodId = UploadFixture.id(7)
        harness.syncManager.isAwaitingBulkUpload = { $0 == foodId }
        harness.stub("POST", "/api/entries", json: """
        {"entry": {"id": "server-1", "userId": "u1", "date": "2026-10-06",
                   "mealType": "lunch", "servings": 1.5, "foodId": "\(foodId)"}}
        """)
        _ = try await harness.entryRepository.createEntry(
            EntryCreate(foodId: foodId, mealType: "lunch", servings: 1.5, date: "2026-10-06"),
            food: harness.food(id: foodId, name: "Rice")
        )

        await harness.syncManager.drainPendingQueue()

        #expect(harness.recordedRequests.isEmpty)
        let held = try #require(harness.syncManager.queuedRows().first)
        #expect(held.retryCount == 0)
        #expect(held.failedAt == nil)
        #expect(held.nextAttemptAt > Date())

        // The upload delivered the food: the operation is sent on the next pass.
        harness.syncManager.isAwaitingBulkUpload = { _ in false }
        held.nextAttemptAt = .distantPast
        try harness.context.save()
        await harness.syncManager.drainPendingQueue()

        #expect(harness.recordedRequests == ["POST /api/entries"])
        #expect(harness.syncManager.queuedRows().isEmpty)
    }

    @Test("A delete is never held back: the server not knowing the food is what it wants")
    func syncQueueDoesNotDeferDeletes() async throws {
        let harness = try RepositoryHarness()
        let foodId = UploadFixture.id(8)
        harness.syncManager.isAwaitingBulkUpload = { _ in true }
        harness.stub("DELETE", "/api/foods/\(foodId)", status: 404, json: "{}")
        harness.syncManager.enqueue(.deleteFood(id: foodId, force: false))

        await harness.syncManager.drainPendingQueue()

        #expect(harness.recordedRequests == ["DELETE /api/foods/\(foodId)"])
        #expect(harness.syncManager.queuedRows().isEmpty)
    }

    @Test("A mirror pass never prunes foods whose upload is pending or parked, and still prunes the rest")
    func pruneProtectsBulkFoods() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.foodRepository
        for (id, name) in [("bulk-pending", "Pending"), ("bulk-failed", "Parked"), ("stale", "Stale")] {
            try harness.context.insert(LocalFood(food: harness.food(id: id, name: name)))
        }
        harness.context.insert(BulkUploadJob(userId: "u1", foodId: "bulk-pending"))
        let parked = BulkUploadJob(userId: "u1", foodId: "bulk-failed")
        parked.state = BulkUploadJob.failedState
        harness.context.insert(parked)
        try harness.context.save()
        harness.stub("GET", "/api/foods", json: #"{"foods": [], "total": 0, "nextCursor": null}"#)
        harness.stub("GET", "/api/foods/ids", json: #"{"ids": []}"#)

        try await repo.mirrorAll(reconcileDeletions: true)

        #expect(repo.food(id: "bulk-pending") != nil)
        #expect(repo.food(id: "bulk-failed") != nil)
        #expect(repo.food(id: "stale") == nil)
    }

    @Test("Refreshing one imported food the server does not know yet keeps its row")
    func refreshFoodKeepsBulkFood() async throws {
        let harness = try RepositoryHarness()
        let repo = harness.foodRepository
        try harness.context.insert(LocalFood(food: harness.food(id: "bulk-1", name: "Pending")))
        try harness.context.insert(LocalFood(food: harness.food(id: "gone-1", name: "Gone")))
        harness.context.insert(BulkUploadJob(userId: "u1", foodId: "bulk-1"))
        try harness.context.save()
        harness.stub("GET", "/api/foods/bulk-1", status: 404, json: "{}")
        harness.stub("GET", "/api/foods/gone-1", status: 404, json: "{}")

        await #expect(throws: APIError.self) { try await repo.refreshFood(id: "bulk-1") }
        await #expect(throws: APIError.self) { try await repo.refreshFood(id: "gone-1") }

        #expect(repo.food(id: "bulk-1") != nil)
        #expect(repo.food(id: "gone-1") == nil)
    }

    // MARK: - Sign-out and downgrade

    @Test("Wiping the local data removes the jobs and forgets the totals")
    func wipeRemovesJobs() async throws {
        let fixture = try UploadFixture()
        try fixture.seed(0 ..< 3)
        await fixture.manager.noteImported(count: 3)
        #expect(fixture.manager.total == 3)

        fixture.manager.reset()
        fixture.harness.migrator.wipeLocalData()

        #expect(try fixture.jobs().isEmpty)
        #expect(try fixture.food(0) == nil)
        #expect(fixture.manager.total == 0)
        #expect(fixture.manager.pendingCount == 0)
        #expect(fixture.harness.defaults.object(forKey: BulkUploadState.totalKey) == nil)
    }

    @Test("Downgrading to Local mode waits while imported foods are still on their way")
    func downgradeBlockedByBulkJobs() async throws {
        let fixture = try UploadFixture()
        try fixture.seed(0 ..< 2)
        let downgrader = AccountDowngrader(
            api: fixture.harness.api,
            context: fixture.harness.context,
            syncManager: fixture.harness.syncManager,
            authManager: AuthManager(baseURL: fixture.harness.baseURL),
            appModeManager: fixture.harness.appMode
        )

        await #expect(throws: AccountDowngrader.DowngradeError.pendingChanges) {
            try await downgrader.downgrade { _ in }
        }
        #expect(fixture.harness.recordedRequests.isEmpty)
    }

    // MARK: - API

    @Test("The bulk route's responses decode, and a 400 is a bad request")
    func apiResponses() async throws {
        let fixture = try UploadFixture()
        fixture.harness.stub("POST", UploadFixture.path, json: """
        {"results":[{"id":"a","status":"created","imageUrl":"/uploads/x.webp"},{"id":"b","status":"invalid","message":"nope"}]}
        """)
        let results = try await fixture.harness.api.postBulkFoods(body: Data("x".utf8), boundary: "b")
        #expect(results == [
            BulkFoodResult(id: "a", status: "created", imageUrl: "/uploads/x.webp", message: nil),
            BulkFoodResult(id: "b", status: "invalid", imageUrl: nil, message: "nope"),
        ])

        fixture.harness.stub("POST", UploadFixture.path, status: 400, json: #"{"error":"foods must be a JSON array"}"#)
        await #expect(throws: APIError.self) {
            try await fixture.harness.api.postBulkFoods(body: Data("x".utf8), boundary: "b")
        }
    }
}
