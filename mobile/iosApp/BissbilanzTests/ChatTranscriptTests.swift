@testable import Bissbilanz
import Foundation
import Testing

/// The documented example of docs/ai-chat.md §9: log a food, then delete an
/// entry after a confirmation.
enum ChatEventFixtures {
    static let conversationId = "83e75848-4125-4fab-b1d5-671e38b93bba"
    static let userMessageId = "d0a7f2a9-8122-420c-ad0b-e2e5c29644a7"
    static let assistantMessageId = "36380e54-7a5c-4e66-98ff-c9370ebecae3"
    static let runId = "9eab9b08-7b01-49f0-afb3-e2f749da54ae"
    static let actionId = "435baadf-008d-4a69-a948-659b75aa3589"
    static let entryChange = ChatChange(domain: "entries", dates: ["2026-11-18"])

    static func run(status: String) -> ChatRun {
        ChatRun(
            id: runId,
            conversationId: conversationId,
            userMessageId: userMessageId,
            assistantMessageId: assistantMessageId,
            status: status,
            changed: [],
            changes: []
        )
    }

    static var userMessage: ChatMessage {
        ChatMessage(
            id: userMessageId,
            conversationId: conversationId,
            role: "user",
            status: "completed",
            runId: runId,
            parts: [ChatMessagePart(type: "text", text: "Log 150 g yogurt, delete the old one")]
        )
    }

    static var action: ChatAction {
        ChatAction(
            id: actionId,
            conversationId: conversationId,
            runId: runId,
            messageId: assistantMessageId,
            toolUseId: "toolu_delete",
            name: "delete_entry",
            label: "Deleting an entry",
            status: "pending",
            preview: ChatActionPreview(
                summary: "Delete “Greek yogurt” from Breakfast on 18 Nov 2026",
                details: ["2 servings · 120 kcal"]
            ),
            expiresAt: "2026-11-19T21:56:15.139Z"
        )
    }

    static func event(_ seq: Int, _ type: String) -> ChatEvent {
        ChatEvent(seq: seq, type: type, createdAt: "2026-11-19T20:56:15.000Z", runId: runId, messageId: assistantMessageId)
    }

    static func textDelta(_ seq: Int, part: Int, _ text: String) -> ChatEvent {
        var delta = event(seq, ChatEventType.textDelta)
        delta.partIndex = part
        delta.text = text
        return delta
    }

    static func toolStarted(_ seq: Int, part: Int, toolUseId: String, name: String, label: String) -> ChatEvent {
        var started = event(seq, ChatEventType.toolStarted)
        started.partIndex = part
        started.toolUseId = toolUseId
        started.name = name
        started.label = label
        return started
    }

    static func toolFinished(_ seq: Int, part: Int, toolUseId: String, name: String) -> ChatEvent {
        var finished = event(seq, ChatEventType.toolFinished)
        finished.partIndex = part
        finished.toolUseId = toolUseId
        finished.name = name
        finished.status = "ok"
        finished.changed = ["entries"]
        finished.changes = [entryChange]
        return finished
    }

    /// Seq 1 to 13, ending in `run_finished` with the capability.
    static var documentedRun: [ChatEvent] {
        var created = ChatEvent(seq: 1, type: ChatEventType.messageCreated, runId: runId)
        created.message = userMessage
        var started = event(2, ChatEventType.runStarted)
        started.run = run(status: "running")
        var required = event(6, ChatEventType.actionRequired)
        required.partIndex = 2
        required.action = action
        var resolved = event(7, ChatEventType.actionResolved)
        resolved.partIndex = 2
        resolved.actionId = actionId
        resolved.status = "approved"
        var resumed = event(8, ChatEventType.runResumed)
        resumed.run = run(status: "running")
        var completed = event(12, ChatEventType.messageCompleted)
        completed.message = finalMessage
        var finished = event(13, ChatEventType.runFinished)
        finished.status = "completed"
        finished.changed = ["entries"]
        finished.changes = [entryChange]
        finished.run = run(status: "completed")
        finished.capability = ChatCapability(available: true, remainingBudgetUsd: 9.98)
        return [
            created,
            started,
            textDelta(3, part: 0, "Let me log that."),
            toolStarted(4, part: 1, toolUseId: "toolu_log", name: "log_food", label: "Logging food"),
            toolFinished(5, part: 1, toolUseId: "toolu_log", name: "log_food"),
            required,
            resolved,
            resumed,
            toolStarted(9, part: 3, toolUseId: "toolu_delete", name: "delete_entry", label: "Deleting an entry"),
            toolFinished(10, part: 3, toolUseId: "toolu_delete", name: "delete_entry"),
            textDelta(11, part: 4, "Logged 150 g Greek yogurt and removed the old entry."),
            completed,
            finished
        ]
    }

    static var finalMessage: ChatMessage {
        ChatMessage(
            id: assistantMessageId,
            conversationId: conversationId,
            role: "assistant",
            status: "completed",
            runId: runId,
            parts: [
                ChatMessagePart(type: "text", text: "Let me log that."),
                ChatMessagePart(
                    type: "tool", toolUseId: "toolu_log", name: "log_food", label: "Logging food", status: "ok",
                    changed: ["entries"], changes: [entryChange]
                ),
                ChatMessagePart(
                    type: "action", toolUseId: "toolu_delete", name: "delete_entry", label: "Deleting an entry",
                    status: "approved", actionId: actionId, preview: action.preview, expiresAt: action.expiresAt
                ),
                ChatMessagePart(
                    type: "tool", toolUseId: "toolu_delete", name: "delete_entry", label: "Deleting an entry",
                    status: "ok", changed: ["entries"], changes: [entryChange]
                ),
                ChatMessagePart(type: "text", text: "Logged 150 g Greek yogurt and removed the old entry.")
            ]
        )
    }
}

@Suite("Chat transcript folding")
struct ChatTranscriptTests {
    private typealias Fixture = ChatEventFixtures

    private static func folded(_ events: [ChatEvent], into start: ChatTranscript = ChatTranscript())
        -> (ChatTranscript, [ChatEventEffect])
    {
        var transcript = start
        let effects = events.map { transcript.apply($0) }
        return (transcript, effects)
    }

    @Test("The documented run folds into the message the server stores")
    func documentedRun() throws {
        var transcript = ChatTranscript()
        for event in Fixture.documentedRun.prefix(11) {
            _ = transcript.apply(event)
        }
        let live = try #require(transcript.messages.last)
        #expect(transcript.messages.count == 2)
        #expect(live.id == Fixture.assistantMessageId)
        #expect(live.isInProgress)
        #expect(live.parts.map(\.type) == ["text", "tool", "action", "tool", "text"])
        #expect(live.parts[0].text == "Let me log that.")
        #expect(live.parts[1].label == "Logging food")
        #expect(live.parts[1].status == "ok")
        #expect(live.parts[2].status == "approved")
        #expect(live.parts[2].preview?.details == ["2 servings · 120 kcal"])
        #expect(live.parts[3].status == "ok")
        #expect(transcript.isRunActive)

        for event in Fixture.documentedRun.dropFirst(11) {
            _ = transcript.apply(event)
        }
        #expect(transcript.messages == [Fixture.userMessage, Fixture.finalMessage])
        #expect(transcript.lastSeq == 13)
        #expect(transcript.activeRun == nil)
        #expect(transcript.pendingActions.isEmpty)
    }

    @Test("Text deltas append in order and a replay never appends twice")
    func replayIsIdempotent() {
        let events = [
            ChatEvent(seq: 1, type: ChatEventType.runStarted, runId: Fixture.runId, messageId: Fixture.assistantMessageId),
            Fixture.textDelta(2, part: 0, "Hel"),
            Fixture.textDelta(3, part: 0, "lo")
        ]
        let (once, _) = Self.folded(events)
        #expect(once.messages.last?.parts.first?.text == "Hello")
        let (replayed, effects) = Self.folded(events + events, into: ChatTranscript())
        #expect(replayed == once)
        #expect(effects.suffix(3).map(\.outcome) == [.duplicate, .duplicate, .duplicate])
    }

    @Test("Seqs need not be contiguous: the next event is applied")
    func seqGaps() {
        var transcript = ChatTranscript(lastSeq: 4)
        #expect(transcript.apply(Fixture.textDelta(9, part: 0, "late")).outcome == .applied)
        #expect(transcript.lastSeq == 9)
        #expect(transcript.messages.last?.parts.first?.text == "late")
        #expect(transcript.apply(Fixture.textDelta(7, part: 0, " again")).outcome == .duplicate)
        #expect(transcript.messages.last?.parts.first?.text == "late")
    }

    @Test("A replay with pruned text deltas still ends in the final message")
    func prunedReplay() {
        let pruned = Fixture.documentedRun.filter { $0.type != ChatEventType.textDelta }
        let (transcript, effects) = Self.folded(pruned)
        #expect(effects.allSatisfy { $0.outcome == .applied })
        #expect(transcript.messages == [Fixture.userMessage, Fixture.finalMessage])
        #expect(transcript.activeRun == nil)
    }

    @Test("An unknown event type is skipped but its seq counts")
    func unknownEvent() {
        var transcript = ChatTranscript()
        let effect = transcript.apply(ChatEvent(seq: 1, type: "thinking_delta", text: "hm"))
        #expect(effect.outcome == .skipped)
        #expect(transcript.lastSeq == 1)
        #expect(transcript.apply(Fixture.textDelta(2, part: 0, "Hi")).outcome == .applied)
    }

    @Test("A conversation read seeds the fold; events up to its lastSeq are ignored")
    func seededFromDetail() throws {
        let detail = ChatConversationDetailResponse(
            conversation: ChatConversation(id: Fixture.conversationId, lastSeq: 3),
            messages: [Fixture.userMessage, ChatMessage(
                id: Fixture.assistantMessageId, role: "assistant", status: "in_progress", runId: Fixture.runId,
                parts: [ChatMessagePart(type: "text", text: "Let me log that.")]
            )],
            pendingActions: [],
            activeRun: Fixture.run(status: "running"),
            lastSeq: 3,
            capability: ChatCapability(available: true)
        )
        var transcript = ChatTranscript(detail: detail)
        #expect(transcript.apply(Fixture.textDelta(3, part: 0, "Let me log that.")).outcome == .duplicate)
        #expect(transcript.apply(Fixture.textDelta(4, part: 0, " Done.")).outcome == .applied)
        let message = try #require(transcript.messages.last)
        #expect(message.parts.first?.text == "Let me log that. Done.")
        #expect(transcript.isRunActive)
    }

    @Test("A confirmation pauses the run and a rejection resolves it")
    func actionLifecycle() throws {
        var transcript = ChatTranscript()
        var started = Fixture.event(1, ChatEventType.runStarted)
        started.run = Fixture.run(status: "running")
        _ = transcript.apply(started)
        var required = Fixture.event(2, ChatEventType.actionRequired)
        required.partIndex = 0
        required.action = Fixture.action
        _ = transcript.apply(required)
        #expect(transcript.pendingActions.map(\.id) == [Fixture.actionId])
        #expect(transcript.activeRun?.status == ChatRunStatus.awaitingConfirmation)
        let card = try #require(transcript.messages.last?.parts.first)
        #expect(card.type == "action")
        #expect(card.actionId == Fixture.actionId)
        #expect(card.status == "pending")
        #expect(card.preview?.summary == Fixture.action.preview?.summary)

        var resolved = Fixture.event(3, ChatEventType.actionResolved)
        resolved.partIndex = 0
        resolved.actionId = Fixture.actionId
        resolved.status = "rejected"
        _ = transcript.apply(resolved)
        #expect(transcript.pendingActions.isEmpty)
        #expect(transcript.messages.last?.parts.first?.status == "rejected")
    }

    @Test("A decision response updates the card wherever it is")
    func applyDecision() {
        var transcript = ChatTranscript()
        var required = Fixture.event(1, ChatEventType.actionRequired)
        required.partIndex = 1
        required.action = Fixture.action
        _ = transcript.apply(required)
        var decided = Fixture.action
        decided.status = "expired"
        transcript.applyDecision(decided)
        #expect(transcript.messages.last?.parts.last?.status == "expired")
        #expect(transcript.pendingActions.isEmpty)
    }

    @Test("Tool and run effects carry the changes and the capability")
    func effects() {
        let (_, effects) = Self.folded(Fixture.documentedRun)
        let toolChanges = effects.filter { !$0.changes.isEmpty && $0.finishedRunId == nil }
        #expect(toolChanges.count == 2)
        let finished = effects.last
        #expect(finished?.finishedRunId == Fixture.runId)
        #expect(finished?.changes == [Fixture.entryChange])
        #expect(finished?.capability == ChatCapability(available: true, remainingBudgetUsd: 9.98))
    }

    @Test("A finished run cannot become active again from a late response")
    func lateRunIsIgnored() {
        let (finished, _) = Self.folded(Fixture.documentedRun)
        var transcript = finished
        transcript.adopt(Fixture.run(status: "queued"))
        #expect(transcript.activeRun == nil)
        transcript.adopt(ChatRun(id: "next-run", status: "queued"))
        #expect(transcript.activeRun?.id == "next-run")
    }

    @Test("Runs known to be over stay over across a re-read")
    func finishedRunsSurviveRereads() {
        let (finished, _) = Self.folded(Fixture.documentedRun)
        var reread = ChatTranscript(lastSeq: 13)
        reread.carryFinishedRuns(from: finished)
        reread.adopt(Fixture.run(status: "queued"))
        #expect(reread.activeRun == nil)

        var following = ChatTranscript(activeRun: ChatRun(id: "gone", status: "running"))
        var after = ChatTranscript(lastSeq: 20)
        after.carryFinishedRuns(from: following)
        after.adopt(ChatRun(id: "gone", status: "queued"))
        #expect(after.activeRun == nil)
        following.adopt(ChatRun(id: "gone", status: "queued"))
        #expect(following.activeRun?.status == "queued")
    }

    @Test("run_finished settles a message whose message_completed never came")
    func runFinishedSettlesMessage() {
        var transcript = ChatTranscript()
        var started = Fixture.event(1, ChatEventType.runStarted)
        started.run = Fixture.run(status: "running")
        _ = transcript.apply(started)
        _ = transcript.apply(Fixture.textDelta(2, part: 0, "Partial"))
        var finished = Fixture.event(3, ChatEventType.runFinished)
        finished.status = "failed"
        finished.reason = "api_error"
        _ = transcript.apply(finished)
        #expect(transcript.messages.last?.status == "failed")
        #expect(transcript.messages.last?.reason == "api_error")
        #expect(transcript.messages.last?.parts.first?.text == "Partial")
        #expect(transcript.activeRun == nil)
    }

    @Test("Parts whose events never arrived hold their place")
    func placeholders() {
        var transcript = ChatTranscript()
        _ = transcript.apply(Fixture.textDelta(1, part: 2, "Third"))
        let parts = transcript.messages.last?.parts ?? []
        #expect(parts.map(\.type) == [ChatMessagePart.placeholderType, ChatMessagePart.placeholderType, "text"])
    }

    @Test("A text delta onto a part of another type replaces it")
    func textReplacesOtherPart() {
        var transcript = ChatTranscript()
        _ = transcript.apply(Fixture.toolStarted(1, part: 0, toolUseId: "t", name: "log_food", label: "Logging food"))
        _ = transcript.apply(Fixture.textDelta(2, part: 0, "Text"))
        #expect(transcript.messages.last?.parts.map(\.type) == ["text"])
    }

    @Test("Tool calls that finished between two reads are found from the messages")
    func finishedBetweenReads() {
        let before = ChatTranscript(messages: [ChatMessage(
            id: Fixture.assistantMessageId, role: "assistant", status: "in_progress",
            parts: [ChatMessagePart(type: "tool", toolUseId: "toolu_log", status: "running")]
        )])
        let after = ChatTranscript(messages: [Fixture.finalMessage])
        let changes = ChatTranscript.finishedToolChanges(from: before, to: after)
        #expect(changes == [Fixture.entryChange, Fixture.entryChange])
        #expect(ChatTranscript.finishedToolChanges(from: after, to: after).isEmpty)
    }

    @Test("Photos the user sent count against the conversation cap")
    func userPhotoCount() {
        let message = ChatMessage(
            id: "m", role: "user", status: "completed",
            parts: [
                ChatMessagePart(type: "image", url: "/uploads/a.webp"),
                ChatMessagePart(type: "image", url: "/uploads/b.webp"),
                ChatMessagePart(type: "text", text: "Lunch")
            ]
        )
        #expect(ChatTranscript(messages: [message]).userPhotoCount == 2)
    }
}
