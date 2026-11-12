@testable import Bissbilanz
import Foundation
import Testing

/// Collects the dates `AiTaskStore.onEntriesChanged` is called with.
@MainActor
private final class EntriesRefreshRecorder {
    var dates: [String] = []
}

@Suite("AI task replies")
@MainActor
struct AiTaskReplyTests {
    private nonisolated static let repliesPath = "/api/ai-tasks/t1/replies"
    private nonisolated static let acknowledgePath = "/api/ai-tasks/acknowledge"

    private nonisolated static func message(
        _ id: String,
        role: String = "assistant",
        outcome: String? = "answered",
        unread: Bool = false,
        text: String = "Done"
    ) -> AiTaskThreadMessage {
        AiTaskThreadMessage(
            id: id, role: role, text: text, outcome: outcome, createdAt: "2026-11-01T12:00:00Z", unread: unread
        )
    }

    private nonisolated static func userMessage(_ id: String) -> AiTaskThreadMessage {
        message(id, role: "user", outcome: nil, text: "It was 200 g")
    }

    private nonisolated static func thread(
        _ messages: [AiTaskThreadMessage] = [],
        state: String = "idle",
        canReply: Bool = true,
        blocked: String? = nil,
        remaining: Int = 5
    ) -> AiTaskClaudeThread {
        AiTaskClaudeThread(
            messages: messages,
            correctionState: state,
            canReply: canReply,
            replyBlockedReason: blocked,
            repliesRemaining: remaining,
            unreadReplies: messages.filter(\.isUnreadAnswer).count
        )
    }

    private nonisolated static func task(
        id: String = "t1",
        status: String = "completed",
        date: String = "2026-11-01",
        acknowledgedAt: String? = "2026-11-01T12:00:00Z",
        thread: AiTaskClaudeThread? = AiTaskReplyTests.thread()
    ) -> AiTask {
        AiTask(
            id: id, userId: "u1", status: status, description: "pasta", photoUrl: nil, photoUrls: [],
            date: date, mealType: "Dinner", eatenAt: nil, source: nil, resultSummary: "Logged pasta",
            createdEntryIds: nil, completedAt: nil, dismissedAt: nil, acknowledgedAt: acknowledgedAt,
            processedBy: "assistant", createdAt: nil, updatedAt: nil, processedByKind: "claude",
            claudeThread: thread
        )
    }

    /// The task as the reply route answers it: the user's message last, the correction queued.
    private nonisolated static let sentTask = task(thread: thread(
        [userMessage("m1")], state: "queued", canReply: false, blocked: "correction_in_flight"
    ))

    private nonisolated static func listJSON(_ tasks: [AiTask]) throws -> String {
        String(decoding: try JSONEncoder().encode(AiTasksResponse(tasks: tasks, total: tasks.count)), as: UTF8.self)
    }

    private nonisolated static func taskJSON(_ task: AiTask) throws -> String {
        String(decoding: try JSONEncoder().encode(AiTaskResponse(task: task)), as: UTF8.self)
    }

    private static func loadedStore(_ harness: RepositoryHarness, tasks: [AiTask]) async throws -> AiTaskStore {
        let store = harness.aiTaskStore
        harness.stub("GET", "/api/ai-tasks", json: try listJSON(tasks))
        try await store.refresh()
        return store
    }

    private nonisolated static func classify(
        _ status: Int, code: String? = nil, error: String? = nil, retryAfter: String? = nil
    ) -> AiTaskReplyFailure {
        AiTaskReplyFailure.classify(status: status, code: code, error: error, retryAfter: retryAfter)
    }

    private static func sentKeys(_ harness: RepositoryHarness) -> [String] {
        harness.recordedHeaders("POST", repliesPath).map { $0["Idempotency-Key"] ?? "" }
    }

    private static func getCount(_ harness: RepositoryHarness) -> Int {
        harness.recordedRequests.filter { $0 == "GET /api/ai-tasks" }.count
    }

    // MARK: - Decoding

    @Test("A task without a thread, or with a null one, still decodes")
    func decodesWithoutThread() throws {
        let absent = try JSONDecoder().decode(AiTask.self, from: Data("""
        {"id": "t1", "userId": "u1", "status": "completed", "photoUrls": [], "date": "2026-11-01"}
        """.utf8))
        #expect(absent.claudeThread == nil)
        #expect(!absent.hasUnreadReplies)

        let null = try JSONDecoder().decode(AiTask.self, from: Data("""
        {"id": "t1", "userId": "u1", "status": "completed", "photoUrls": [], "date": "2026-11-01",
         "processedByKind": "assistant", "claudeThread": null}
        """.utf8))
        #expect(null.claudeThread == nil)
    }

    @Test("A thread decodes its messages, states and counts")
    func decodesThread() throws {
        let task = try JSONDecoder().decode(AiTask.self, from: Data("""
        {"id": "t1", "userId": "u1", "status": "completed", "photoUrls": [], "date": "2026-11-01",
         "processedByKind": "claude",
         "claudeThread": {
            "messages": [
                {"id": "m1", "role": "user", "text": "It was 200 g", "outcome": null,
                 "createdAt": "2026-11-01T12:00:00Z", "unread": false},
                {"id": "m2", "role": "assistant", "text": "Updated", "outcome": "changed",
                 "createdAt": "2026-11-01T12:01:00Z", "unread": true}
            ],
            "correctionState": "idle", "canReply": true, "replyBlockedReason": null,
            "repliesRemaining": 4, "unreadReplies": 1
         }}
        """.utf8))
        let thread = try #require(task.claudeThread)
        #expect(thread.messages.map(\.id) == ["m1", "m2"])
        #expect(thread.messages[0].isFromUser)
        #expect(thread.messages[1].replyOutcome == .changed)
        #expect(thread.correction == .idle)
        #expect(thread.canReply)
        #expect(thread.blockedReason == nil)
        #expect(thread.repliesRemaining == 4)
        #expect(thread.unreadAnswers.map(\.id) == ["m2"])
        #expect(task.hasUnreadReplies)
    }

    @Test("Unknown roles, outcomes, states and reasons fall back instead of failing")
    func decodesUnknownValues() throws {
        let thread = try JSONDecoder().decode(AiTaskClaudeThread.self, from: Data("""
        {"messages": [{"id": "m1", "role": "system", "text": "Note", "outcome": "partially",
                       "createdAt": "2026-11-01T12:00:00Z", "unread": true}],
         "correctionState": "paused", "canReply": false, "replyBlockedReason": "maintenance",
         "repliesRemaining": 0, "unreadReplies": 1}
        """.utf8))
        let message = try #require(thread.messages.first)
        #expect(!message.isFromUser)
        #expect(message.replyOutcome == .answered)
        #expect(message.isUnreadAnswer)
        #expect(thread.correction == .other)
        #expect(thread.correction.isInFlight)
        #expect(!thread.correction.isPolled)
        #expect(thread.blockedReason == .other)
    }

    @Test("Every known state, outcome and reason maps to its own case")
    func mapsKnownValues() {
        #expect(AiTaskCorrectionState(rawState: "idle") == .idle)
        #expect(AiTaskCorrectionState(rawState: "queued") == .queued)
        #expect(AiTaskCorrectionState(rawState: "running") == .running)
        #expect(AiTaskCorrectionState(rawState: "retrying") == .retrying)
        #expect(AiTaskCorrectionState(rawState: "failed") == .failed)
        #expect(!AiTaskCorrectionState.idle.isInFlight)
        #expect(!AiTaskCorrectionState.failed.isInFlight)
        #expect(AiTaskCorrectionState.queued.isInFlight)
        #expect(AiTaskCorrectionState.running.isInFlight)
        #expect(AiTaskCorrectionState.retrying.isInFlight)

        #expect(AiTaskReplyOutcome(rawOutcome: "changed") == .changed)
        #expect(AiTaskReplyOutcome(rawOutcome: "failed") == .failed)
        #expect(AiTaskReplyOutcome(rawOutcome: "answered") == .answered)
        #expect(AiTaskReplyOutcome(rawOutcome: nil) == .answered)

        #expect(AiTaskReplyBlockedReason(code: "not_processed_by_server") == .notProcessedByServer)
        #expect(AiTaskReplyBlockedReason(code: "not_completed") == .notCompleted)
        #expect(AiTaskReplyBlockedReason(code: "correction_in_flight") == .correctionInFlight)
        #expect(AiTaskReplyBlockedReason(code: "reply_limit_reached") == .replyLimitReached)
        #expect(AiTaskReplyBlockedReason(code: "failed_too_often") == .failedTooOften)
        #expect(AiTaskReplyBlockedReason(code: "processor_unavailable") == .processorUnavailable)
        #expect(AiTaskReplyBlockedReason(code: "budget_exhausted") == .budgetExhausted)
        #expect(AiTaskReplyBlockedReason(code: "rate_limited") == .rateLimited)
        #expect(AiTaskReplyBlockedReason(knownCode: "task_not_found") == nil)
        #expect(AiTaskReplyBlockedReason(knownCode: nil) == nil)
    }

    @Test("The user's own message never counts as an unread answer")
    func userMessageIsNeverUnread() {
        let message = Self.message("m1", role: "user", outcome: nil, unread: true)
        #expect(!message.isUnreadAnswer)
        #expect(!Self.task(thread: Self.thread([message])).hasUnreadReplies)
    }

    @Test("An empty acknowledge body still means everything; replyIds alone name no task")
    func acknowledgeBodies() throws {
        let empty = String(decoding: try JSONEncoder().encode(AiTaskAcknowledge()), as: UTF8.self)
        #expect(empty == "{}")
        let replies = String(decoding: try JSONEncoder().encode(AiTaskAcknowledge(replyIds: ["m1"])), as: UTF8.self)
        #expect(replies == #"{"replyIds":["m1"]}"#)

        let older = try JSONDecoder().decode(AiTaskAcknowledgeResponse.self, from: Data(#"{"acknowledged": 2}"#.utf8))
        #expect(older.repliesAcknowledged == nil)
        let newer = try JSONDecoder().decode(
            AiTaskAcknowledgeResponse.self, from: Data(#"{"acknowledged": 0, "repliesAcknowledged": 3}"#.utf8)
        )
        #expect(newer.repliesAcknowledged == 3)
    }

    // MARK: - Classifying a failed send

    @Test("Every documented status and code classifies into its own failure")
    func classifiesDocumentedRejections() {
        #expect(Self.classify(404, code: "task_not_found") == .taskNotFound)
        #expect(Self.classify(404) == .taskNotFound)
        #expect(Self.classify(409, code: "not_processed_by_server") == .blocked(.notProcessedByServer, retryAfter: nil))
        #expect(Self.classify(409, code: "not_completed") == .blocked(.notCompleted, retryAfter: nil))
        #expect(Self.classify(409, code: "correction_in_flight") == .blocked(.correctionInFlight, retryAfter: nil))
        #expect(Self.classify(409, code: "reply_limit_reached") == .blocked(.replyLimitReached, retryAfter: nil))
        #expect(Self.classify(403, code: "processor_unavailable") == .blocked(.processorUnavailable, retryAfter: nil))
        #expect(Self.classify(403, code: "budget_exhausted") == .blocked(.budgetExhausted, retryAfter: nil))
        #expect(Self.classify(429, code: "rate_limited", retryAfter: "120") == .blocked(.rateLimited, retryAfter: 120))
        #expect(
            Self.classify(429, code: "failed_too_often", retryAfter: "3600")
                == .blocked(.failedTooOften, retryAfter: 3600)
        )
        #expect(Self.classify(422, error: "idempotency_key_reused") == .keyReused)
        #expect(Self.classify(503, error: "request_in_progress", retryAfter: "5") == .requestInProgress(retryAfter: 5))
        #expect(Self.classify(400) == .invalid)
    }

    @Test("Codes this build does not know fall back to a generic failure of their status")
    func classifiesUnknownRejections() {
        #expect(Self.classify(429, retryAfter: "30") == .tooManyRequests(retryAfter: 30))
        #expect(Self.classify(429) == .tooManyRequests(retryAfter: 60))
        #expect(Self.classify(429, code: "brand_new") == .tooManyRequests(retryAfter: 60))
        #expect(Self.classify(409, code: "brand_new") == .rejected(status: 409, code: "brand_new"))
        #expect(Self.classify(403) == .rejected(status: 403, code: nil))
        #expect(Self.classify(422, error: "something_else") == .failed(status: 422))
        #expect(Self.classify(503) == .failed(status: 503))
        #expect(Self.classify(500) == .failed(status: 500))
    }

    @Test("The code is read from the body, and a body that is not JSON falls back to the status")
    func classifiesFromBody() {
        let limit = Data(#"{"error": "Reply limit reached", "code": "reply_limit_reached"}"#.utf8)
        let limited = AiTaskReplyFailure(status: 409, body: limit, retryAfter: nil)
        #expect(limited == .blocked(.replyLimitReached, retryAfter: nil))
        let pending = Data(#"{"error": "request_in_progress"}"#.utf8)
        #expect(AiTaskReplyFailure(status: 503, body: pending, retryAfter: "2") == .requestInProgress(retryAfter: 2))
        #expect(AiTaskReplyFailure(status: 502, body: Data("<html>".utf8), retryAfter: nil) == .failed(status: 502))
    }

    @Test("Transport failures, a dead session and the version gate keep their meaning")
    func classifiesTransportFailures() {
        #expect(AiTaskReplyFailure(transport: .networkError(URLError(.notConnectedToInternet))) == .network)
        #expect(AiTaskReplyFailure(transport: .unauthorized) == .unauthorized)
        #expect(AiTaskReplyFailure(transport: .updateRequired(minVersion: "2.0.0")) == .updateRequired)
    }

    @Test("Documented rejections are breadcrumbs, anything else is reported")
    func expectedFailures() {
        #expect(AiTaskReplyFailure.network.isExpected)
        #expect(AiTaskReplyFailure.unauthorized.isExpected)
        #expect(AiTaskReplyFailure.updateRequired.isExpected)
        #expect(AiTaskReplyFailure.taskNotFound.isExpected)
        #expect(AiTaskReplyFailure.blocked(.rateLimited, retryAfter: 60).isExpected)
        #expect(AiTaskReplyFailure.tooManyRequests(retryAfter: 60).isExpected)
        #expect(AiTaskReplyFailure.requestInProgress(retryAfter: 1).isExpected)
        #expect(AiTaskReplyFailure.rejected(status: 409, code: "brand_new").isExpected)
        #expect(!AiTaskReplyFailure.rejected(status: 403, code: nil).isExpected)
        #expect(!AiTaskReplyFailure.keyReused.isExpected)
        #expect(!AiTaskReplyFailure.invalid.isExpected)
        #expect(!AiTaskReplyFailure.failed(status: 500).isExpected)
    }

    // MARK: - Keys and text

    @Test("A retry of the same text keeps its key; a different text gets a new one")
    func attemptKeys() {
        let first = AiTaskReplyAttempt.next(for: "It was 200 g", previous: nil, makeKey: { "k1" })
        #expect(first == AiTaskReplyAttempt(key: "k1", text: "It was 200 g"))
        #expect(AiTaskReplyAttempt.next(for: "It was 200 g", previous: first, makeKey: { "k2" }).key == "k1")
        #expect(AiTaskReplyAttempt.next(for: "It was 250 g", previous: first, makeKey: { "k2" }).key == "k2")
        let fresh = AiTaskReplyAttempt.next(for: "x", previous: nil)
        #expect(fresh.key != AiTaskReplyAttempt.next(for: "x", previous: nil).key)
    }

    @Test("Reply text is trimmed, counted and cut the way the server counts it")
    func draftRules() {
        #expect(AiTaskReplyDraft.trimmed("  fix it \n") == "fix it")
        #expect(AiTaskReplyDraft.length("🍝") == 2)
        #expect(AiTaskReplyDraft.clamped("short") == "short")
        #expect(AiTaskReplyDraft.clamped(String(repeating: "a", count: 1200)).count == 1000)
        // Never splits a character the limit falls in the middle of.
        let emoji = String(repeating: "a", count: 999) + "🍝"
        #expect(AiTaskReplyDraft.clamped(emoji) == String(repeating: "a", count: 999))
    }

    // MARK: - Polling and the first tab

    @Test("A correction is polled only in the states this build knows to end")
    func pollingDecisions() {
        for state in ["queued", "running", "retrying"] {
            #expect(AiTaskStore.hasPollableWork(in: [Self.task(thread: Self.thread(state: state))]), "\(state)")
        }
        for state in ["idle", "failed", "paused"] {
            #expect(!AiTaskStore.hasPollableWork(in: [Self.task(thread: Self.thread(state: state))]), "\(state)")
        }
        #expect(!AiTaskStore.hasPollableWork(in: [Self.task(thread: nil)]))

        var pending = Self.task(status: "pending", thread: nil)
        pending.claudeProcessing = AiTaskClaudeProcessing(state: "running", proposal: nil)
        #expect(AiTaskStore.hasPollableWork(in: [pending]))
    }

    @Test("Two pollers share one read, and a tick right after a read is skipped")
    func pollRefreshDedupes() async throws {
        let harness = try RepositoryHarness()
        let store = harness.aiTaskStore
        harness.stub("GET", "/api/ai-tasks", json: try Self.listJSON([Self.task()]), delayMs: 100)

        let first = Task { try await store.pollRefresh() }
        let second = Task { try await store.pollRefresh() }
        try await first.value
        try await second.value
        #expect(Self.getCount(harness) == 1)

        try await store.pollRefresh()
        #expect(Self.getCount(harness) == 1)

        try await store.pollRefresh(now: Date().addingTimeInterval(AiTaskStore.pollMinimumGap + 1))
        #expect(Self.getCount(harness) == 2)
    }

    @Test("The list opens on the tab holding news: a dismissal first, then an answer or a running correction")
    func statusWithNews() {
        let dismissal = Self.task(id: "d1", status: "dismissed", acknowledgedAt: nil, thread: nil)
        let answered = Self.task(id: "c1", thread: Self.thread([Self.message("m1", unread: true)]))
        let correcting = Self.task(id: "c2", thread: Self.thread(state: "running"))
        let quiet = Self.task(id: "c3")

        #expect(AiTaskThreadChanges.statusWithNews(in: [answered, dismissal]) == "dismissed")
        #expect(AiTaskThreadChanges.statusWithNews(in: [quiet, answered]) == "completed")
        #expect(AiTaskThreadChanges.statusWithNews(in: [quiet, correcting]) == "completed")
        #expect(AiTaskThreadChanges.statusWithNews(in: [quiet]) == nil)
    }

    // MARK: - Sending

    @Test("A reply posts the trimmed text with a key, swaps in the task and never queues")
    func sendReplySucceeds() async throws {
        let harness = try RepositoryHarness()
        let store = try await Self.loadedStore(harness, tasks: [Self.task()])
        harness.stub("POST", Self.repliesPath, status: 201, json: try Self.taskJSON(Self.sentTask))

        let result = await store.sendReply(taskId: "t1", text: "  It was 200 g \n")

        #expect(result == .sent)
        #expect(store.tasks.first?.claudeThread?.correction == .queued)
        #expect(store.tasks.first?.claudeThread?.messages.map(\.id) == ["m1"])
        #expect(store.hasActiveClaudeWork)
        #expect(store.sendingReplies.isEmpty)
        let body = try #require(harness.recordedBodies("POST", Self.repliesPath).first)
        #expect(try JSONDecoder().decode(AiTaskReplyCreate.self, from: body).text == "It was 200 g")
        #expect(Self.sentKeys(harness).first?.isEmpty == false)
        #expect(harness.syncManager.queuedRows().isEmpty)
    }

    @Test("A failed send keeps its key for the same text; new text or a sent reply gets a new one")
    func sendReplyKeys() async throws {
        let harness = try RepositoryHarness()
        let store = try await Self.loadedStore(harness, tasks: [Self.task()])

        harness.stub("POST", Self.repliesPath, status: 500, json: #"{"error": "boom"}"#)
        #expect(await store.sendReply(taskId: "t1", text: "It was 200 g") == .failed(.failed(status: 500)))
        harness.stubError("POST", Self.repliesPath, code: .notConnectedToInternet)
        #expect(await store.sendReply(taskId: "t1", text: "It was 200 g ") == .failed(.network))
        harness.stub("POST", Self.repliesPath, status: 201, json: try Self.taskJSON(Self.sentTask))
        #expect(await store.sendReply(taskId: "t1", text: "It was 250 g") == .sent)
        #expect(await store.sendReply(taskId: "t1", text: "It was 250 g") == .sent)

        let keys = Self.sentKeys(harness)
        #expect(keys.count == 4)
        #expect(keys[0] == keys[1])
        #expect(keys[2] != keys[1])
        #expect(keys[3] != keys[2])
        #expect(harness.syncManager.queuedRows().isEmpty)
    }

    @Test("A key the server tied to another request is replaced")
    func sendReplyRotatesReusedKey() async throws {
        let harness = try RepositoryHarness()
        let store = try await Self.loadedStore(harness, tasks: [Self.task()])
        harness.stub("POST", Self.repliesPath, status: 422, json: #"{"error": "idempotency_key_reused"}"#)

        #expect(await store.sendReply(taskId: "t1", text: "It was 200 g") == .failed(.keyReused))
        #expect(await store.sendReply(taskId: "t1", text: "It was 200 g") == .failed(.keyReused))

        let keys = Self.sentKeys(harness)
        #expect(keys.count == 2)
        #expect(keys[0] != keys[1])
    }

    @Test("A rejection re-reads the list so the thread says why")
    func sendReplyRejectionRefreshes() async throws {
        let harness = try RepositoryHarness()
        let store = try await Self.loadedStore(harness, tasks: [Self.task()])
        let limited = Self.task(thread: Self.thread(canReply: false, blocked: "rate_limited"))
        harness.stub("GET", "/api/ai-tasks", json: try Self.listJSON([limited]))
        harness.stub(
            "POST", Self.repliesPath, status: 429,
            json: #"{"error": "Too many replies", "code": "rate_limited"}"#,
            headers: ["Retry-After": "3600"]
        )

        let result = await store.sendReply(taskId: "t1", text: "It was 200 g")

        #expect(result == .failed(.blocked(.rateLimited, retryAfter: 3600)))
        #expect(store.tasks.first?.claudeThread?.blockedReason == .rateLimited)
        #expect(Self.getCount(harness) == 2)
    }

    @Test("A request still in progress under the same key is waited for, then answered")
    func sendReplyWaitsForRequestInProgress() async throws {
        let harness = try RepositoryHarness()
        let store = try await Self.loadedStore(harness, tasks: [Self.task()])
        let sentJSON = try Self.taskJSON(Self.sentTask)
        harness.stubSequence("POST", Self.repliesPath, [
            (status: 503, json: #"{"error": "request_in_progress"}"#, headers: ["Retry-After": "1"]),
            (status: 201, json: sentJSON, headers: ["x-idempotent-replay": "true"]),
        ])

        let result = await store.sendReply(taskId: "t1", text: "It was 200 g")

        #expect(result == .sent)
        let keys = Self.sentKeys(harness)
        #expect(keys.count == 2)
        #expect(keys[0] == keys[1])
    }

    @Test("A second tap while a reply is on its way sends nothing")
    func sendReplyOnceAtATime() async throws {
        let harness = try RepositoryHarness()
        let store = try await Self.loadedStore(harness, tasks: [Self.task()])
        harness.stub("POST", Self.repliesPath, status: 201, json: try Self.taskJSON(Self.sentTask), delayMs: 200)

        let first = Task { await store.sendReply(taskId: "t1", text: "It was 200 g") }
        let second = Task { await store.sendReply(taskId: "t1", text: "It was 200 g") }
        let results = [await first.value, await second.value]

        #expect(results.filter { $0 == .sent }.count == 1)
        #expect(results.contains(.skipped))
        #expect(Self.sentKeys(harness).count == 1)
        #expect(await store.sendReply(taskId: "t1", text: "   ") == .skipped)
    }

    @Test("A list read that started before a reply never overwrites the reply's result")
    func readNeverOverwritesSend() async throws {
        let harness = try RepositoryHarness()
        let store = try await Self.loadedStore(harness, tasks: [Self.task()])
        harness.stub("GET", "/api/ai-tasks", json: try Self.listJSON([Self.task()]), delayMs: 300)
        harness.stub("POST", Self.repliesPath, status: 201, json: try Self.taskJSON(Self.sentTask))

        let read = Task { try await store.refresh() }
        try await Task.sleep(for: .milliseconds(50))
        #expect(await store.sendReply(taskId: "t1", text: "It was 200 g") == .sent)
        try await read.value

        #expect(store.tasks.first?.claudeThread?.messages.map(\.id) == ["m1"])
        #expect(store.tasks.first?.claudeThread?.correction == .queued)
    }

    @Test("Local mode has no server to reply to")
    func sendReplySkipsInLocalMode() async throws {
        let harness = try RepositoryHarness(mode: .local)
        let store = harness.aiTaskStore

        #expect(await store.sendReply(taskId: "t1", text: "It was 200 g") == .skipped)
        await store.markRepliesRead(ids: ["m1"])
        #expect(harness.recordedRequests.isEmpty)
    }

    // MARK: - Unread answers

    @Test("Shown answers are marked read with replyIds only, and a stale read keeps them read")
    func markRepliesReadSendsReplyIdsOnly() async throws {
        let harness = try RepositoryHarness()
        let answered = Self.task(thread: Self.thread([Self.userMessage("m1"), Self.message("m2", unread: true)]))
        let dismissal = Self.task(id: "d1", status: "dismissed", acknowledgedAt: nil, thread: nil)
        let store = try await Self.loadedStore(harness, tasks: [answered, dismissal])
        #expect(store.hasUnreadReplies)
        harness.stub("POST", Self.acknowledgePath, json: #"{"acknowledged": 0, "repliesAcknowledged": 1}"#)

        await store.markRepliesRead(ids: ["m2"])

        #expect(!store.hasUnreadReplies)
        #expect(store.tasks.first?.claudeThread?.unreadReplies == 0)
        #expect(store.unreadDismissals.map(\.id) == ["d1"])
        let body = try #require(harness.recordedBodies("POST", Self.acknowledgePath).first)
        #expect(String(decoding: body, as: UTF8.self) == #"{"replyIds":["m2"]}"#)

        // The stub still answers unread, like a read that left before the acknowledgement.
        try await store.refresh()
        #expect(!store.hasUnreadReplies)

        // Already read on this device: not sent again.
        await store.markRepliesRead(ids: ["m2"])
        #expect(harness.recordedBodies("POST", Self.acknowledgePath).count == 1)
    }

    @Test("More than 100 answers go in several requests, none of them naming a task")
    func markRepliesReadChunks() async throws {
        let harness = try RepositoryHarness()
        let messages = (0 ..< 150).map { Self.message("m\($0)", unread: true) }
        let store = try await Self.loadedStore(harness, tasks: [Self.task(thread: Self.thread(messages))])
        harness.stub("POST", Self.acknowledgePath, json: #"{"acknowledged": 0, "repliesAcknowledged": 100}"#)

        await store.markRepliesRead(ids: messages.map(\.id))

        let sent = try harness.recordedBodies("POST", Self.acknowledgePath).map {
            try JSONDecoder().decode(AiTaskAcknowledge.self, from: $0)
        }
        #expect(sent.map { $0.replyIds?.count ?? 0 } == [100, 50])
        #expect(sent.allSatisfy { $0.ids == nil })
        #expect(!store.hasUnreadReplies)
    }

    @Test("A failed acknowledgement leaves the answers unread for the next try")
    func markRepliesReadFailureKeepsUnread() async throws {
        let harness = try RepositoryHarness()
        let store = try await Self.loadedStore(
            harness, tasks: [Self.task(thread: Self.thread([Self.message("m2", unread: true)]))]
        )
        harness.stub("POST", Self.acknowledgePath, status: 500, json: #"{"error": "boom"}"#)

        await store.markRepliesRead(ids: ["m2"])
        #expect(store.hasUnreadReplies)

        harness.stub("POST", Self.acknowledgePath, json: #"{"acknowledged": 0, "repliesAcknowledged": 1}"#)
        await store.markRepliesRead(ids: ["m2"])
        #expect(!store.hasUnreadReplies)
    }

    @Test("Opening the list still acknowledges dismissals with an empty body")
    func dismissalAcknowledgeUnchanged() async throws {
        let harness = try RepositoryHarness()
        let dismissal = Self.task(id: "d1", status: "dismissed", acknowledgedAt: nil, thread: nil)
        let store = try await Self.loadedStore(harness, tasks: [dismissal])
        harness.stub("POST", Self.acknowledgePath, json: #"{"acknowledged": 1}"#)

        await store.acknowledgeAll()

        let body = try #require(harness.recordedBodies("POST", Self.acknowledgePath).first)
        #expect(String(decoding: body, as: UTF8.self) == "{}")
    }

    // MARK: - Diary refresh

    @Test("A new answer that changed the meal re-pulls that day, once")
    func changedAnswerRefreshesEntries() async throws {
        let harness = try RepositoryHarness()
        let store = harness.aiTaskStore
        let recorder = EntriesRefreshRecorder()
        store.onEntriesChanged = { date in recorder.dates.append(date) }
        let earlier = Self.task(
            id: "t0", date: "2026-10-30", thread: Self.thread([Self.message("m0", outcome: "changed")])
        )

        // The first read of a launch has nothing to compare against.
        harness.stub("GET", "/api/ai-tasks", json: try Self.listJSON([earlier, Self.sentTask]))
        try await store.refresh()
        #expect(recorder.dates.isEmpty)

        let changed = Self.task(thread: Self.thread([Self.userMessage("m1"), Self.message("m2", outcome: "changed")]))
        harness.stub("GET", "/api/ai-tasks", json: try Self.listJSON([earlier, changed]))
        try await store.refresh()
        try await store.refresh()
        #expect(recorder.dates == ["2026-11-01"])

        let answered = Self.task(thread: Self.thread([
            Self.userMessage("m1"), Self.message("m2", outcome: "changed"),
            Self.userMessage("m3"), Self.message("m4", outcome: "answered"),
        ]))
        harness.stub("GET", "/api/ai-tasks", json: try Self.listJSON([earlier, answered]))
        try await store.refresh()
        #expect(recorder.dates == ["2026-11-01"])
    }

    @Test("Only new changing answers count, each date once")
    func datesWithNewChanges() {
        let known = Self.message("m1", outcome: "changed")
        let before = [Self.task(thread: Self.thread([known]))]
        let after = [
            Self.task(thread: Self.thread([known, Self.message("m2", outcome: "changed")])),
            Self.task(id: "t2", thread: Self.thread([Self.message("m3", outcome: "changed")])),
            Self.task(id: "t3", date: "2026-11-02", thread: Self.thread([Self.message("m4", outcome: "failed")])),
            Self.task(id: "t4", date: "2026-11-03", thread: Self.thread([Self.userMessage("m5")])),
        ]
        #expect(AiTaskThreadChanges.datesWithNewChanges(previous: before, next: after) == ["2026-11-01"])
        #expect(AiTaskThreadChanges.datesWithNewChanges(previous: after, next: after).isEmpty)
    }

    // MARK: - Notifications

    @Test("Each unread answer is announced once per device, and the record follows the list")
    func replyAnnouncementsOncePerMessage() throws {
        let defaults = try #require(UserDefaults(suiteName: "test-\(UUID().uuidString)"))
        let tasks = [Self.task(thread: Self.thread([
            Self.userMessage("m1"),
            Self.message("m2", unread: true, text: "Changed it to 200 g"),
            Self.message("m3", unread: false),
        ]))]

        let fresh = AiTaskNotifier.freshReplies(
            in: tasks, notified: Set(AiTaskNotifier.storedNotifiedReplyIds(defaults: defaults))
        )
        #expect(fresh == [AiTaskNotifier.ReplyAnnouncement(taskId: "t1", messageId: "m2", text: "Changed it to 200 g")])

        AiTaskNotifier.recordReplyAnnouncements(for: fresh, in: tasks, defaults: defaults)
        let again = AiTaskNotifier.freshReplies(
            in: tasks, notified: Set(AiTaskNotifier.storedNotifiedReplyIds(defaults: defaults))
        )
        #expect(again.isEmpty)

        // An empty list is what a failed refresh looks like: the record stays.
        AiTaskNotifier.recordReplyAnnouncements(for: [], in: [], defaults: defaults)
        #expect(AiTaskNotifier.storedNotifiedReplyIds(defaults: defaults) == ["m2"])

        // Once the server no longer returns the answer, its id goes.
        AiTaskNotifier.recordReplyAnnouncements(for: [], in: [Self.task(id: "t2")], defaults: defaults)
        #expect(AiTaskNotifier.storedNotifiedReplyIds(defaults: defaults).isEmpty)
    }

    @Test("A burst of answers is capped and leaves dismissal ids alone")
    func replyAnnouncementsCapped() throws {
        let defaults = try #require(UserDefaults(suiteName: "test-\(UUID().uuidString)"))
        defaults.set(["d1"], forKey: "ai_task_notified_ids")
        let messages = (0 ..< 15).map { Self.message("m\($0)", unread: true) }
        let tasks = [Self.task(thread: Self.thread(messages))]

        let fresh = AiTaskNotifier.freshReplies(in: tasks, notified: [])
        AiTaskNotifier.recordReplyAnnouncements(for: fresh, in: tasks, defaults: defaults)

        #expect(fresh.count == 10)
        #expect(AiTaskNotifier.storedNotifiedReplyIds(defaults: defaults).count == 10)
        #expect(defaults.stringArray(forKey: "ai_task_notified_ids") == ["d1"])
    }
}
