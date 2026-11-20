import Foundation

enum ChatEventType {
    static let messageCreated = "message_created"
    static let runStarted = "run_started"
    static let runResumed = "run_resumed"
    static let textDelta = "text_delta"
    static let toolStarted = "tool_started"
    static let toolFinished = "tool_finished"
    static let actionRequired = "action_required"
    static let actionResolved = "action_resolved"
    static let messageCompleted = "message_completed"
    static let runFinished = "run_finished"
    static let error = "error"
}

/// What applying one event did to a transcript.
enum ChatEventOutcome: Equatable, Sendable {
    case applied
    /// `seq` at or below `lastSeq`: a replay after a reconnect, ignored.
    case duplicate
    /// An event of a type this build does not know: skipped, its seq counted.
    case skipped
}

/// The parts of an applied event the store acts on beyond the transcript.
struct ChatEventEffect: Equatable, Sendable {
    var outcome: ChatEventOutcome
    var changes: [ChatChange] = []
    var changed: [String] = []
    var capability: ChatCapability?
    /// Set by `run_finished`.
    var finishedRunId: String?
    /// Set by `error`: the run's reason code, for the log.
    var errorCode: String?
}

/// The open conversation as display messages, folded from the conversation
/// read and the events after it the way the server builds its stored
/// messages (docs/ai-chat.md §9). Applying an event is idempotent by `seq`, so
/// a replay never appends text twice. Seqs need not be contiguous: text
/// deltas are deleted after 24 hours, and `message_completed` carries the
/// final text anyway (§5.3).
struct ChatTranscript: Equatable, Sendable {
    private(set) var messages: [ChatMessage]
    private(set) var lastSeq: Int
    /// The run the conversation follows until its `run_finished`; it can hold
    /// a final status for a moment after a cancel answered first.
    private(set) var activeRun: ChatRun?
    private(set) var pendingActions: [ChatAction]
    /// Runs whose `run_finished` was applied, so a late response cannot make
    /// one active again.
    private(set) var finishedRunIds: Set<String> = []

    init(
        messages: [ChatMessage] = [],
        lastSeq: Int = 0,
        activeRun: ChatRun? = nil,
        pendingActions: [ChatAction] = []
    ) {
        self.messages = messages
        self.lastSeq = lastSeq
        self.activeRun = activeRun
        self.pendingActions = pendingActions
    }

    init(detail: ChatConversationDetailResponse) {
        self.init(
            messages: detail.messages,
            lastSeq: detail.lastSeq,
            activeRun: detail.activeRun,
            pendingActions: detail.pendingActions.filter { $0.status == ChatActionStatus.pending }
        )
    }

    var isRunActive: Bool {
        activeRun?.isActive == true
    }

    /// Photos the user sent in this conversation, against its 20-photo cap.
    var userPhotoCount: Int {
        messages.filter(\.isFromUser).reduce(0) { count, message in
            count + message.parts.filter { $0.type == ChatMessagePart.imageType }.count
        }
    }

    // MARK: - Events

    mutating func apply(_ event: ChatEvent) -> ChatEventEffect {
        if event.seq <= lastSeq {
            return ChatEventEffect(outcome: .duplicate)
        }
        lastSeq = event.seq
        var effect = ChatEventEffect(outcome: .applied)
        switch event.type {
        case ChatEventType.messageCreated, ChatEventType.messageCompleted:
            if let message = event.message {
                upsert(message)
            }
        case ChatEventType.runStarted, ChatEventType.runResumed:
            startRun(event)
        case ChatEventType.textDelta:
            appendText(event)
        case ChatEventType.toolStarted:
            startTool(event)
        case ChatEventType.toolFinished:
            finishTool(event)
            effect.changes = event.changes ?? []
            effect.changed = event.changed ?? []
        case ChatEventType.actionRequired:
            requireAction(event)
        case ChatEventType.actionResolved:
            resolveAction(event)
        case ChatEventType.runFinished:
            finishRun(event)
            effect.changes = event.changes ?? event.run?.changes ?? []
            effect.changed = event.changed ?? event.run?.changed ?? []
            effect.capability = event.capability
            effect.finishedRunId = event.runId ?? event.run?.id
        case ChatEventType.error:
            effect.errorCode = event.code
        default:
            effect.outcome = .skipped
        }
        return effect
    }

    // MARK: - Direct updates

    /// Inserts or replaces a message by id: the accepted user message, a
    /// `message_created`, or the final message of `message_completed`.
    mutating func upsert(_ message: ChatMessage) {
        if let index = messages.firstIndex(where: { $0.id == message.id }) {
            messages[index] = message
        } else {
            messages.append(message)
        }
    }

    /// Follows `run` unless its `run_finished` was already applied. A response
    /// (an accepted send, a decision, a cancel) can be older than the events
    /// already applied, so for the run already followed it only counts when it
    /// says the run is over; a poll page is a snapshot and always counts.
    mutating func adopt(_ run: ChatRun, fromSnapshot: Bool = false) {
        guard !finishedRunIds.contains(run.id) else { return }
        if !fromSnapshot, activeRun?.id == run.id, run.isActive {
            return
        }
        activeRun = run
    }

    /// Keeps the runs known to be over across a re-read of the conversation:
    /// those whose `run_finished` was applied, and one the read no longer
    /// shows as active. A late answer to a decision or a send then still
    /// cannot make one active again.
    mutating func carryFinishedRuns(from previous: ChatTranscript) {
        finishedRunIds.formUnion(previous.finishedRunIds)
        if let run = previous.activeRun, activeRun?.id != run.id {
            finishedRunIds.insert(run.id)
        }
    }

    /// The action as the server now has it, from a decision or a 409 body.
    mutating func applyDecision(_ action: ChatAction) {
        for messageIndex in messages.indices {
            for partIndex in messages[messageIndex].parts.indices
                where messages[messageIndex].parts[partIndex].actionId == action.id
            {
                messages[messageIndex].parts[partIndex].status = action.status
            }
        }
        if action.status == ChatActionStatus.pending {
            upsertPendingAction(action)
        } else {
            pendingActions.removeAll { $0.id == action.id }
        }
    }

    // MARK: - Folding

    private mutating func startRun(_ event: ChatEvent) {
        if let run = event.run {
            activeRun = run
        } else if let runId = event.runId, activeRun?.id != runId {
            activeRun = ChatRun(id: runId, status: ChatRunStatus.running)
        }
        if let messageId = event.messageId {
            _ = assistantMessageIndex(id: messageId, event: event)
        }
    }

    private mutating func appendText(_ event: ChatEvent) {
        guard let messageId = event.messageId, let partIndex = event.partIndex, partIndex >= 0,
              let text = event.text
        else { return }
        let index = assistantMessageIndex(id: messageId, event: event)
        var parts = messages[index].parts
        if partIndex < parts.count, parts[partIndex].type == ChatMessagePart.textType {
            parts[partIndex].text = (parts[partIndex].text ?? "") + text
        } else {
            Self.place(ChatMessagePart(type: ChatMessagePart.textType, text: text), at: partIndex, in: &parts)
        }
        messages[index].parts = parts
    }

    private mutating func startTool(_ event: ChatEvent) {
        guard let messageId = event.messageId, let partIndex = event.partIndex, partIndex >= 0 else { return }
        let index = assistantMessageIndex(id: messageId, event: event)
        let part = ChatMessagePart(
            type: ChatMessagePart.toolType,
            toolUseId: event.toolUseId,
            name: event.name,
            label: event.label,
            status: "running"
        )
        Self.place(part, at: partIndex, in: &messages[index].parts)
    }

    private mutating func finishTool(_ event: ChatEvent) {
        guard let messageId = event.messageId, let partIndex = event.partIndex, partIndex >= 0 else { return }
        let index = assistantMessageIndex(id: messageId, event: event)
        var part: ChatMessagePart
        if partIndex < messages[index].parts.count,
           messages[index].parts[partIndex].type == ChatMessagePart.toolType
        {
            part = messages[index].parts[partIndex]
        } else {
            part = ChatMessagePart(type: ChatMessagePart.toolType, toolUseId: event.toolUseId, name: event.name)
        }
        part.status = event.status ?? "ok"
        part.summary = event.summary
        part.changed = event.changed
        part.changes = event.changes
        if let label = event.label {
            part.label = label
        }
        Self.place(part, at: partIndex, in: &messages[index].parts)
    }

    private mutating func requireAction(_ event: ChatEvent) {
        guard let action = event.action else { return }
        upsertPendingAction(action)
        let runId = event.runId ?? action.runId
        if var run = activeRun, run.id == runId {
            run.status = ChatRunStatus.awaitingConfirmation
            activeRun = run
        }
        guard let messageId = event.messageId ?? action.messageId, let partIndex = event.partIndex,
              partIndex >= 0
        else { return }
        let index = assistantMessageIndex(id: messageId, event: event)
        let part = ChatMessagePart(
            type: ChatMessagePart.actionType,
            toolUseId: action.toolUseId,
            name: action.name,
            label: action.label,
            status: ChatActionStatus.pending,
            actionId: action.id,
            preview: action.preview,
            expiresAt: action.expiresAt
        )
        Self.place(part, at: partIndex, in: &messages[index].parts)
    }

    private mutating func resolveAction(_ event: ChatEvent) {
        guard let status = event.status else { return }
        if let actionId = event.actionId {
            pendingActions.removeAll { $0.id == actionId }
        }
        if let messageId = event.messageId, let partIndex = event.partIndex,
           let index = messages.firstIndex(where: { $0.id == messageId }),
           messages[index].parts.indices.contains(partIndex),
           messages[index].parts[partIndex].type == ChatMessagePart.actionType
        {
            messages[index].parts[partIndex].status = status
            return
        }
        guard let actionId = event.actionId else { return }
        for messageIndex in messages.indices {
            for partIndex in messages[messageIndex].parts.indices
                where messages[messageIndex].parts[partIndex].actionId == actionId
            {
                messages[messageIndex].parts[partIndex].status = status
            }
        }
    }

    private mutating func finishRun(_ event: ChatEvent) {
        guard let runId = event.runId ?? event.run?.id else { return }
        finishedRunIds.insert(runId)
        if activeRun?.id == runId {
            activeRun = nil
        }
        pendingActions.removeAll { $0.runId == runId }
        // `message_completed` normally settled the message already; this only
        // covers one that never came, so the message does not spin forever.
        guard let messageId = event.messageId,
              let index = messages.firstIndex(where: { $0.id == messageId }),
              messages[index].isInProgress
        else { return }
        let status = event.status ?? event.run?.status ?? "completed"
        guard !ChatRunStatus.isActive(status) else { return }
        messages[index].status = status
        messages[index].reason = event.reason ?? event.run?.reason
    }

    private mutating func upsertPendingAction(_ action: ChatAction) {
        if let index = pendingActions.firstIndex(where: { $0.id == action.id }) {
            pendingActions[index] = action
        } else {
            pendingActions.append(action)
        }
    }

    /// The assistant message `id`, created empty and in progress when no event
    /// for it arrived yet.
    private mutating func assistantMessageIndex(id: String, event: ChatEvent) -> Int {
        if let index = messages.firstIndex(where: { $0.id == id }) {
            return index
        }
        messages.append(ChatMessage(
            id: id,
            role: "assistant",
            status: "in_progress",
            runId: event.runId,
            parts: [],
            createdAt: event.createdAt,
            updatedAt: event.createdAt
        ))
        return messages.count - 1
    }

    /// `parts[index] = part`, holding the place of parts that never arrived so
    /// later indexes still line up.
    private static func place(_ part: ChatMessagePart, at index: Int, in parts: inout [ChatMessagePart]) {
        while parts.count < index {
            parts.append(ChatMessagePart(type: ChatMessagePart.placeholderType))
        }
        if index < parts.count {
            parts[index] = part
        } else {
            parts.append(part)
        }
    }

    // MARK: - Re-reads

    /// What tool calls finished between two reads of the same conversation —
    /// a run that went on while the app was away — as the changes to refresh.
    /// Derived from the messages' tool parts, as the contract allows.
    static func finishedToolChanges(from previous: ChatTranscript, to next: ChatTranscript) -> [ChatChange] {
        var finished: Set<String> = []
        for message in previous.messages {
            for part in message.parts where isFinishedTool(part) {
                if let toolUseId = part.toolUseId {
                    finished.insert(toolUseId)
                }
            }
        }
        var changes: [ChatChange] = []
        for message in next.messages where !message.isFromUser {
            for part in message.parts where isFinishedTool(part) {
                if let toolUseId = part.toolUseId, finished.contains(toolUseId) { continue }
                changes.append(contentsOf: ChatRefreshPlan.scopedChanges(
                    changes: part.changes ?? [],
                    changed: part.changed ?? []
                ))
            }
        }
        return changes
    }

    private static func isFinishedTool(_ part: ChatMessagePart) -> Bool {
        part.type == ChatMessagePart.toolType && part.status != "running"
    }
}
