@testable import Bissbilanz
import Foundation
import Testing

/// What the chat store asked the app to do around a send.
@MainActor
private final class ChatHookRecorder {
    var plans: [ChatRefreshPlan] = []
    var drains = 0
}

@Suite("Chat requests")
@MainActor
struct ChatAPITests {
    private typealias Fixture = ChatEventFixtures
    private static let conversationId = ChatEventFixtures.conversationId
    private static let messagesPath = "/api/chat/conversations/\(ChatEventFixtures.conversationId)/messages"
    private static let eventsPath = "/api/chat/conversations/\(ChatEventFixtures.conversationId)/events"
    private static let detailPath = "/api/chat/conversations/\(ChatEventFixtures.conversationId)"
    private static let conversationsPath = "/api/chat/conversations"

    private static func json(_ value: some Encodable) throws -> String {
        String(decoding: try JSONEncoder().encode(value), as: UTF8.self)
    }

    private static var conversation: ChatConversation {
        ChatConversation(
            id: conversationId,
            title: nil,
            createdAt: "2026-11-19T20:56:14.000Z",
            updatedAt: "2026-11-19T20:56:14.000Z",
            lastMessageAt: "2026-11-19T20:56:14.000Z",
            lastSeq: 0
        )
    }

    private static func accepted(runStatus: String) throws -> String {
        try json(ChatMessageAcceptedResponse(
            message: Fixture.userMessage,
            run: Fixture.run(status: runStatus),
            seq: 1
        ))
    }

    /// The documented run as an event stream.
    private static func streamBody(_ events: [ChatEvent]) throws -> String {
        var body = "retry: 3000\n\n"
        for event in events {
            body += "id: \(event.seq)\nevent: \(event.type)\ndata: \(try json(event))\n\n: ping\n\n"
        }
        return body
    }

    private static let streamHeaders = ["Content-Type": "text/event-stream; charset=utf-8"]

    private static func message(_ text: String) -> ChatMessageCreate {
        ChatMessageCreate(
            id: "d0a7f2a9-8122-420c-ad0b-e2e5c29644a7",
            text: text,
            context: ChatMessageContext(date: "2026-11-18", timezone: "Europe/Zurich", locale: "de")
        )
    }

    private static func waitUntil(_ condition: () -> Bool) async {
        for _ in 0 ..< 300 where !condition() {
            try? await Task.sleep(for: .milliseconds(10))
        }
    }

    // MARK: - Request building

    @Test("A message goes out with its id as the key and no Idempotency-Key header")
    func sendRequest() async throws {
        let harness = try RepositoryHarness()
        harness.stub("POST", Self.messagesPath, status: 202, json: try Self.accepted(runStatus: "queued"))
        let accepted = try await harness.api.sendChatMessage(conversationId: Self.conversationId, Self.message("Hi"))
        #expect(accepted.run.status == "queued")
        let body = try #require(harness.recordedBodies("POST", Self.messagesPath).first)
        let sent = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect(sent?["id"] as? String == "d0a7f2a9-8122-420c-ad0b-e2e5c29644a7")
        #expect(sent?["text"] as? String == "Hi")
        #expect(sent?["imageFilenames"] == nil)
        let context = sent?["context"] as? [String: Any]
        #expect(context?["date"] as? String == "2026-11-18")
        #expect(context?["timezone"] as? String == "Europe/Zurich")
        #expect(context?["locale"] as? String == "de")
        let headers = try #require(harness.recordedHeaders("POST", Self.messagesPath).first)
        #expect(headers["Idempotency-Key"] == nil)
        #expect(headers["X-Client-Platform"] == "ios")
        #expect(headers["Content-Type"] == "application/json")
    }

    @Test("Approve and reject post the decision; cancel posts to the run")
    func decisionAndCancel() async throws {
        let harness = try RepositoryHarness()
        let actionPath = "/api/chat/actions/\(Fixture.actionId)"
        let decision = try Self.json(ChatActionDecisionResponse(action: Fixture.action, run: Fixture.run(status: "queued")))
        harness.stub("POST", actionPath, json: decision)
        _ = try await harness.api.decideChatAction(id: Fixture.actionId, approve: true)
        _ = try await harness.api.decideChatAction(id: Fixture.actionId, approve: false)
        let decisions = try harness.recordedBodies("POST", actionPath).map {
            try JSONDecoder().decode(ChatActionDecision.self, from: $0).decision
        }
        #expect(decisions == ["approve", "reject"])

        let cancelPath = "/api/chat/runs/\(Fixture.runId)/cancel"
        harness.stub("POST", cancelPath, json: try Self.json(ChatRunResponse(run: Fixture.run(status: "cancelled"))))
        let run = try await harness.api.cancelChatRun(id: Fixture.runId)
        #expect(run.status == "cancelled")
        #expect(harness.recordedRequests.contains("POST \(cancelPath)"))
    }

    @Test("Create, rename and list build the documented requests")
    func conversationRequests() async throws {
        let harness = try RepositoryHarness()
        let response = try Self.json(ChatConversationResponse(conversation: Self.conversation))
        harness.stub("POST", Self.conversationsPath, status: 201, json: response)
        harness.stub("PATCH", Self.detailPath, json: response)
        harness.stub("GET", Self.conversationsPath, json: try Self.json(ChatConversationsResponse(conversations: [], total: 0)))

        _ = try await harness.api.createChatConversation(id: Self.conversationId)
        _ = try await harness.api.renameChatConversation(id: Self.conversationId, title: nil)
        _ = try await harness.api.listChatConversations()

        let created = try #require(harness.recordedBodies("POST", Self.conversationsPath).first)
        #expect(String(decoding: created, as: UTF8.self) == #"{"id":"\#(Self.conversationId)"}"#)
        let renamed = try #require(harness.recordedBodies("PATCH", Self.detailPath).first)
        #expect(String(decoding: renamed, as: UTF8.self) == #"{"title":null}"#)
        #expect(harness.recordedQueries("GET", Self.conversationsPath) == ["limit=100"])
    }

    @Test("A refused send keeps its code, capability and Retry-After")
    func rejectionBody() async throws {
        let harness = try RepositoryHarness()
        harness.stub(
            "POST", Self.messagesPath, status: 403,
            json: #"{"error":"Budget","code":"budget_exhausted","capability":{"available":false,"blockedReason":"user_budget_exhausted"}}"#
        )
        do {
            _ = try await harness.api.sendChatMessage(conversationId: Self.conversationId, Self.message("Hi"))
            Issue.record("Expected a rejection")
        } catch let failure as ChatFailure {
            let rejection = try #require(failure.rejection)
            #expect(rejection.status == 403)
            #expect(rejection.code == "budget_exhausted")
            #expect(rejection.body?.capability == ChatCapability(available: false, blockedReason: "user_budget_exhausted"))
            #expect(rejection.isExpected)
        }

        harness.stub(
            "POST", Self.messagesPath, status: 429,
            json: #"{"error":"Limit","code":"daily_limit_reached"}"#, headers: ["Retry-After": "3600"]
        )
        do {
            _ = try await harness.api.sendChatMessage(conversationId: Self.conversationId, Self.message("Hi"))
            Issue.record("Expected a rejection")
        } catch let failure as ChatFailure {
            #expect(failure.rejection?.retryAfter == 3600)
            #expect(ChatNotice.forFailure(failure) == .dailyLimit(retryAfter: 3600))
        }
    }

    @Test("The JSON fallback asks for JSON and pages with after")
    func pollingRequest() async throws {
        let harness = try RepositoryHarness()
        let page = ChatEventsResponse(events: Fixture.documentedRun, nextAfter: 13, lastSeq: 13, hasMore: false, activeRun: nil)
        harness.stub("GET", Self.eventsPath, json: try Self.json(page))
        let received = try await harness.api.chatEvents(conversationId: Self.conversationId, after: 4)
        #expect(received.events.count == 13)
        #expect(harness.recordedQueries("GET", Self.eventsPath) == ["after=4&limit=500"])
        #expect(harness.recordedHeaders("GET", Self.eventsPath).first?["Accept"] == "application/json")
    }

    // MARK: - Event stream

    @Test("The stream asks for server-sent events after lastSeq and yields each event")
    func followStream() async throws {
        let harness = try RepositoryHarness()
        harness.stub(
            "GET", Self.eventsPath,
            json: try Self.streamBody(Array(Fixture.documentedRun.suffix(2))), headers: Self.streamHeaders
        )
        var items: [ServerSentEventItem] = []
        try await harness.api.followChatEvents(conversationId: Self.conversationId, after: 11) { item in
            items.append(item)
            return true
        }
        #expect(items.first == .opened)
        #expect(items.contains(.retry(3000)))
        let types = items.compactMap { item -> String? in
            if case let .event(event) = item { return event.event }
            return nil
        }
        #expect(types == ["message_completed", "run_finished"])
        #expect(harness.recordedQueries("GET", Self.eventsPath) == ["after=11"])
        let headers = try #require(harness.recordedHeaders("GET", Self.eventsPath).first)
        #expect(headers["Accept"] == "text/event-stream")
        #expect(headers["Last-Event-ID"] == "11")
        #expect(headers["X-Client-Platform"] == "ios")
    }

    @Test("A stream the server refuses throws its rejection")
    func streamRejected() async throws {
        let harness = try RepositoryHarness()
        harness.stub("GET", Self.eventsPath, status: 404, json: #"{"error":"Not found","code":"conversation_not_found"}"#)
        do {
            try await harness.api.followChatEvents(conversationId: Self.conversationId, after: 0) { _ in true }
            Issue.record("Expected a rejection")
        } catch let failure as ChatFailure {
            #expect(failure.rejection?.status == 404)
            #expect(failure.rejection?.code == "conversation_not_found")
            #expect(ChatStore.followRecovery(after: failure) == .missing)
        }
    }

    @Test("A 426 on the stream trips the update gate")
    func streamUpdateRequired() async throws {
        let harness = try RepositoryHarness()
        harness.stub("GET", Self.eventsPath, status: 426, json: #"{"minVersion":"9.9.9"}"#)
        do {
            try await harness.api.followChatEvents(conversationId: Self.conversationId, after: 0) { _ in true }
            Issue.record("Expected update required")
        } catch let failure as ChatFailure {
            guard case .transport(.updateRequired(minVersion: "9.9.9")) = failure else {
                Issue.record("Unexpected failure \(failure)")
                return
            }
        }
        #expect(harness.api.updateGate.minVersion == "9.9.9")
    }

    // MARK: - Store

    private static func store(_ harness: RepositoryHarness) -> ChatStore {
        ChatStore(
            api: harness.api,
            appMode: harness.appMode,
            preferences: harness.preferencesRepository,
            defaults: harness.defaults
        )
    }

    @Test("A first message creates the chat, follows the run to its end and refreshes what changed")
    func sendAndFollow() async throws {
        let harness = try RepositoryHarness()
        harness.stub(
            "POST", Self.conversationsPath, status: 201,
            json: try Self.json(ChatConversationResponse(conversation: Self.conversation))
        )
        harness.stub("POST", Self.messagesPath, status: 202, json: try Self.accepted(runStatus: "running"))
        harness.stub("GET", Self.eventsPath, json: try Self.streamBody(Fixture.documentedRun), headers: Self.streamHeaders)
        var titled = Self.conversation
        titled.title = "Log 150 g yogurt"
        harness.stub("GET", Self.conversationsPath, json: try Self.json(ChatConversationsResponse(
            conversations: [ChatConversationListItem(
                id: titled.id, title: titled.title, lastMessageAt: titled.lastMessageAt, lastSeq: 13
            )],
            total: 1
        )))
        let store = Self.store(harness)
        let recorder = ChatHookRecorder()
        store.refreshData = { plan in recorder.plans.append(plan) }
        store.prepareToSend = { recorder.drains += 1 }

        await store.open(ChatRoute(id: Self.conversationId, isNew: true))
        #expect(store.detailState == .loaded)
        store.send(text: "  Log 150 g yogurt  ", images: [], in: Self.conversationId, contextDate: "2026-11-18")
        #expect(store.pending.count == 1)

        await Self.waitUntil { store.transcript.lastSeq == 13 && store.connection == .idle }
        await Self.waitUntil { !recorder.plans.isEmpty }
        await store.refreshTask?.value

        #expect(store.pending.isEmpty)
        #expect(store.transcript.messages == [Fixture.userMessage, Fixture.finalMessage])
        #expect(store.transcript.activeRun == nil)
        #expect(recorder.drains == 1)
        #expect(recorder.plans.reduce(into: Set<String>()) { $0.formUnion($1.entryDates) } == ["2026-11-18"])
        #expect(store.capability == ChatCapability(available: true, remainingBudgetUsd: 9.98))
        #expect(harness.recordedQueries("GET", Self.eventsPath).first == "after=0")

        let body = try #require(harness.recordedBodies("POST", Self.messagesPath).first)
        let sent = try JSONDecoder().decode(ChatMessageCreate.self, from: body)
        #expect(sent.text == "Log 150 g yogurt")
        #expect(sent.context?.date == "2026-11-18")
        #expect(UUID(uuidString: sent.id) != nil)
        #expect(sent.id == sent.id.lowercased())
        await Self.waitUntil { store.conversations.first?.title != nil }
        #expect(store.conversations.map(\.id) == [Self.conversationId])
        #expect(store.conversations.first?.title == "Log 150 g yogurt")
    }

    @Test("A retry after a failed send reuses the message id and does not create the chat again")
    func retryReusesId() async throws {
        let harness = try RepositoryHarness()
        harness.stub(
            "POST", Self.conversationsPath, status: 201,
            json: try Self.json(ChatConversationResponse(conversation: Self.conversation))
        )
        harness.stubError("POST", Self.messagesPath, code: .notConnectedToInternet)
        let store = Self.store(harness)
        await store.open(ChatRoute(id: Self.conversationId, isNew: true))
        store.send(text: "Hello", images: [], in: Self.conversationId, contextDate: nil)
        await Self.waitUntil { store.pending.first?.state != .sending }
        let failed = try #require(store.pending.first)
        #expect(failed.state == .failed(.offline))

        harness.stub("POST", Self.messagesPath, status: 202, json: try Self.accepted(runStatus: "completed"))
        harness.stub("GET", Self.detailPath, json: try Self.json(ChatConversationDetailResponse(
            conversation: Self.conversation,
            messages: [Fixture.userMessage, Fixture.finalMessage],
            pendingActions: [],
            activeRun: nil,
            lastSeq: 13,
            capability: ChatCapability(available: true)
        )))
        store.retry(failed.id)
        await Self.waitUntil { store.pending.isEmpty && store.transcript.lastSeq == 13 }

        let ids = try harness.recordedBodies("POST", Self.messagesPath).map {
            try JSONDecoder().decode(ChatMessageCreate.self, from: $0).id
        }
        #expect(ids.count == 2)
        #expect(Set(ids).count == 1)
        #expect(harness.recordedRequests.filter { $0 == "POST \(Self.conversationsPath)" }.count == 1)
        #expect(store.transcript.messages.count == 2)
    }

    @Test("A send the server refuses for budget keeps the message and stores the capability")
    func refusedSend() async throws {
        let harness = try RepositoryHarness()
        harness.stub(
            "POST", Self.conversationsPath, status: 201,
            json: try Self.json(ChatConversationResponse(conversation: Self.conversation))
        )
        harness.stub(
            "POST", Self.messagesPath, status: 403,
            json: #"{"error":"Budget","code":"budget_exhausted","capability":{"available":false,"blockedReason":"user_budget_exhausted"}}"#
        )
        let store = Self.store(harness)
        await store.open(ChatRoute(id: Self.conversationId, isNew: true))
        store.send(text: "Hello", images: [], in: Self.conversationId, contextDate: nil)
        await Self.waitUntil { store.pending.first?.state != .sending }
        #expect(store.pending.first?.state == .failed(.budgetExhausted))
        #expect(store.capability?.available == false)
        #expect(store.unavailableNotice == .budgetExhausted)
    }

    @Test("Drafts are kept per conversation and dropped when it is deleted")
    func drafts() async throws {
        let harness = try RepositoryHarness()
        let store = Self.store(harness)
        store.setDraft("half a thought", for: "a")
        store.setDraft("", for: "b")
        #expect(store.draft(for: "a") == "half a thought")
        #expect(store.draft(for: "b").isEmpty)
        let reloaded = Self.store(harness)
        #expect(reloaded.draft(for: "a") == "half a thought")
        let deleted = await store.deleteConversation(id: "a")
        #expect(deleted == nil)
        #expect(store.draft(for: "a").isEmpty)
        #expect(harness.recordedRequests.isEmpty)
    }
}
