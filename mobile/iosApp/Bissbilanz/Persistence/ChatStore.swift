import Foundation
import Observation
import UIKit

/// The conversation the chat screen shows. A new chat carries an id the app
/// made up; it exists on the server once its first message goes out.
struct ChatRoute: Hashable, Identifiable {
    let id: String
    let isNew: Bool

    static func newChat() -> ChatRoute {
        ChatRoute(id: UUID().uuidString.lowercased(), isNew: true)
    }
}

/// A message on its way: on screen at once, and kept with its id until the
/// server took it, so a retry after a failure that never got an answer is
/// answered from the first attempt instead of starting a second run.
struct ChatPendingMessage: Identifiable, Equatable {
    enum State: Equatable {
        case sending
        case failed(ChatNotice)
    }

    let id: UUID
    /// The idempotency key: reused by every retry of this message.
    var messageId: String
    let conversationId: String
    let text: String
    let images: [UIImage]
    /// The uploaded photos, once uploaded, so a retry does not upload again.
    var imageFilenames: [String]?
    let context: ChatMessageContext
    var state: State
    /// The last attempt failed after the request went out without an answer
    /// to read: the message may be on the server already.
    var mayHaveLanded = false
}

enum ChatDetailState: Equatable {
    case idle
    case loading
    case loaded
    case failed(ChatNotice)
    /// Deleted (here or on another device), or never there.
    case missing
}

/// How the open conversation follows its run.
enum ChatConnection: Equatable {
    case idle
    case connecting
    case live
    case reconnecting
    case polling
}

/// Only the seq of an event that could not be read, so the fold moves past it.
private struct ChatEventHeader: Decodable {
    let seq: Int
}

/// The assistant chat, in memory: the conversation list and the open
/// conversation, folded from its read and the events after it. Chat is online
/// only; nothing here goes through the sync queue. The open conversation
/// follows its run over server-sent events, falls back to polling when the
/// stream keeps failing, and stops once no run is active or the screen closes;
/// a run left behind is watched quietly until it ends, for the data it changes.
@MainActor
@Observable
final class ChatStore {
    private let api: BissbilanzAPI
    private let appMode: AppModeManager
    private let preferences: PreferencesRepository
    private let defaults: UserDefaults

    /// Uploads the offline queue before a send, so the assistant sees local edits.
    @ObservationIgnored var prepareToSend: (@MainActor () async -> Void)?
    /// Runs the refreshes a plan names; set once by the app. The second
    /// argument says whether the account the plan belongs to is still the
    /// signed-in one, so nothing of an old account is written after sign-out.
    @ObservationIgnored var refreshData: (@MainActor (ChatRefreshPlan, @MainActor () -> Bool) async -> Void)?

    /// Posted after the diary data the assistant changed was pulled again.
    nonisolated static let didChangeDataNotification = Notification.Name("ChatStoreDidChangeData")
    nonisolated static let draftsKey = "chat_drafts"
    nonisolated static let privacyAcknowledgedKey = "chat_privacy_acknowledged"
    nonisolated static let streamFailuresBeforePolling = 3
    /// How long polling stands in for a stream that failed, across follows.
    nonisolated static let pollingFallbackDuration: TimeInterval = 10 * 60
    nonisolated static let maxConsecutiveGaps = 3
    nonisolated static let activePollInterval: TimeInterval = 1.5
    nonisolated static let confirmationPollInterval: TimeInterval = 30
    /// A run left behind is polled this often, and for at most this long.
    nonisolated static let watchPollInterval: TimeInterval = 5
    nonisolated static let watchLimit: TimeInterval = 20 * 60
    nonisolated static let unreadableEventType = "unreadable"
    nonisolated static let photoMaxDimension: CGFloat = 1024
    nonisolated static let photoQuality: CGFloat = 0.75

    // MARK: - State

    private(set) var conversations: [ChatConversationListItem] = []
    private(set) var hasLoadedList = false
    private(set) var listNotice: ChatNotice?

    private(set) var openId: String?
    private(set) var conversation: ChatConversation?
    private(set) var transcript = ChatTranscript()
    private(set) var detailState: ChatDetailState = .idle
    private(set) var connection: ChatConnection = .idle
    private(set) var pending: [ChatPendingMessage] = []
    /// A failure outside a send: a cancel, a re-read, the stream giving up, a
    /// run that ended without an answer.
    private(set) var notice: ChatNotice?
    private(set) var actionsInFlight: Set<String> = []
    private(set) var actionNotices: [String: ChatNotice] = [:]
    private(set) var isCancelling = false

    @ObservationIgnored private var drafts: [String: String]
    @ObservationIgnored private var attachmentDrafts: [String: [UIImage]] = [:]
    /// Conversations the server is known to have, so a new chat is created once.
    @ObservationIgnored private var knownIds: Set<String> = []
    @ObservationIgnored private var isVisible = false
    @ObservationIgnored private var openGeneration = 0
    /// Bumped by `resetAccountState`; work that started for another account
    /// drops its result.
    @ObservationIgnored private var account = 0
    @ObservationIgnored private var followTask: Task<Void, Never>?
    @ObservationIgnored private var followToken = 0
    /// Failed streams or polls in a row; an arriving event resets it.
    @ObservationIgnored private var followFailures = 0
    /// Set when the stream failed: polling stands in until then.
    @ObservationIgnored private var pollingUntil: Date?
    @ObservationIgnored private var retryBase: TimeInterval = 3
    @ObservationIgnored private var runWatches: [String: Task<Void, Never>] = [:]
    @ObservationIgnored private var pendingPlan = ChatRefreshPlan()
    /// The last accepted send per conversation, so a read that started before
    /// it cannot drop the message it just showed.
    @ObservationIgnored private var lastAccepted: [String: ChatMessageAcceptedResponse] = [:]
    /// Keeps a send going for the time iOS grants after leaving the app.
    @ObservationIgnored private var sendTasks: [UUID: UIBackgroundTaskIdentifier] = [:]
    @ObservationIgnored private var flushTask: Task<Void, Never>?
    @ObservationIgnored private(set) var refreshTask: Task<Void, Never>?

    init(
        api: BissbilanzAPI,
        appMode: AppModeManager,
        preferences: PreferencesRepository,
        defaults: UserDefaults = .standard
    ) {
        self.api = api
        self.appMode = appMode
        self.preferences = preferences
        self.defaults = defaults
        drafts = defaults.dictionary(forKey: Self.draftsKey) as? [String: String] ?? [:]
    }

    private func isCurrent(_ account: Int) -> Bool {
        account == self.account
    }

    // MARK: - Capability

    /// The last known chat capability; nil means unknown, which lets the user
    /// try (a refused send brings the real one).
    var capability: ChatCapability? {
        preferences.claudeCapability?.chat
    }

    var unavailableNotice: ChatNotice? {
        capability.flatMap(ChatNotice.forCapability)
    }

    private func adopt(_ capability: ChatCapability?) {
        guard let capability else { return }
        preferences.updateChatCapability(capability)
    }

    /// A message for the conversation is still on its way.
    func isSending(in conversationId: String) -> Bool {
        pending.contains { $0.conversationId == conversationId && $0.state == .sending }
    }

    // MARK: - Drafts

    func draft(for conversationId: String) -> String {
        drafts[conversationId] ?? ""
    }

    func setDraft(_ text: String, for conversationId: String) {
        let stored = text.isEmpty ? nil : text
        guard drafts[conversationId] != stored else { return }
        drafts[conversationId] = stored
        defaults.set(drafts, forKey: Self.draftsKey)
    }

    func attachments(for conversationId: String) -> [UIImage] {
        attachmentDrafts[conversationId] ?? []
    }

    func setAttachments(_ images: [UIImage], for conversationId: String) {
        attachmentDrafts[conversationId] = images.isEmpty ? nil : images
    }

    /// How many more photos the conversation takes, against both caps.
    func photoRoom(in conversationId: String) -> Int {
        let sent = openId == conversationId ? transcript.userPhotoCount : 0
        let queued = pending.filter { $0.conversationId == conversationId }.reduce(0) { $0 + $1.images.count }
        return max(0, min(ChatLimits.maxPhotosPerMessage, ChatLimits.maxPhotosPerConversation - sent - queued))
    }

    /// A new chat, with `text` (a message a full chat could not take) waiting
    /// in its composer.
    func startNewChat(carrying text: String? = nil) -> ChatRoute {
        let route = ChatRoute.newChat()
        if let text, !text.isEmpty {
            setDraft(text, for: route.id)
        }
        return route
    }

    // MARK: - List

    func loadConversations() async {
        guard !appMode.isLocal else { return }
        let account = self.account
        do {
            let response = try await api.listChatConversations()
            guard isCurrent(account) else { return }
            conversations = Self.sortedNewestFirst(response.conversations)
            knownIds.formUnion(response.conversations.map(\.id))
            listNotice = nil
        } catch {
            guard isCurrent(account) else { return }
            listNotice = ChatNotice.forFailure(error)
        }
        hasLoadedList = true
    }

    nonisolated static func sortedNewestFirst(_ items: [ChatConversationListItem]) -> [ChatConversationListItem] {
        items.enumerated().sorted { lhs, rhs in
            let left = lhs.element.lastMessageAt ?? lhs.element.updatedAt ?? ""
            let right = rhs.element.lastMessageAt ?? rhs.element.updatedAt ?? ""
            return left == right ? lhs.offset < rhs.offset : left > right
        }.map(\.element)
    }

    func renameConversation(id: String, title: String) async -> ChatNotice? {
        let trimmed = ChatLimits.clamped(
            title.trimmingCharacters(in: .whitespacesAndNewlines),
            maxUTF16: ChatLimits.maxTitleLength
        )
        let newTitle: String? = trimmed.isEmpty ? nil : trimmed
        let account = self.account
        do {
            let renamed: ChatConversation
            if knownIds.contains(id) {
                renamed = try await api.renameChatConversation(id: id, title: newTitle)
            } else {
                renamed = try await api.createChatConversation(id: id, title: newTitle)
            }
            guard isCurrent(account) else { return nil }
            knownIds.insert(id)
            remember(renamed)
            return nil
        } catch {
            return ChatNotice.forFailure(error)
        }
    }

    func deleteConversation(id: String) async -> ChatNotice? {
        let account = self.account
        if knownIds.contains(id) {
            do {
                try await api.deleteChatConversation(id: id)
            } catch let failure as ChatFailure where failure.rejection?.status == 404 {
                ErrorReporter.addBreadcrumb("Chat already deleted", category: "chat", data: ["status": 404])
            } catch {
                return ChatNotice.forFailure(error)
            }
        }
        guard isCurrent(account) else { return nil }
        forget(id)
        return nil
    }

    private func forget(_ id: String) {
        conversations.removeAll { $0.id == id }
        knownIds.remove(id)
        pending.removeAll { $0.conversationId == id }
        setDraft("", for: id)
        attachmentDrafts[id] = nil
        runWatches.removeValue(forKey: id)?.cancel()
        guard openId == id else { return }
        stopFollowing()
        openGeneration += 1
        transcript = ChatTranscript()
        conversation = nil
        detailState = .missing
    }

    /// The list row for `conversation`, added or updated in place.
    private func remember(_ conversation: ChatConversation) {
        if openId == conversation.id {
            self.conversation = conversation
        }
        if let index = conversations.firstIndex(where: { $0.id == conversation.id }) {
            conversations[index].title = conversation.title
            conversations[index].lastMessageAt = conversation.lastMessageAt
            conversations[index].updatedAt = conversation.updatedAt
        } else {
            conversations.insert(ChatConversationListItem(
                id: conversation.id,
                title: conversation.title,
                createdAt: conversation.createdAt,
                updatedAt: conversation.updatedAt,
                lastMessageAt: conversation.lastMessageAt,
                lastSeq: conversation.lastSeq,
                activeRun: nil
            ), at: 0)
        }
    }

    private func updateListRun(_ conversationId: String, run: ChatRun?) {
        guard let index = conversations.firstIndex(where: { $0.id == conversationId }) else { return }
        conversations[index].activeRun = run?.isActive == true ? run : nil
    }

    // MARK: - Opening and following

    /// Shows `route`: a known conversation is read, then followed while a run
    /// is active; a new one starts empty.
    func open(_ route: ChatRoute) async {
        guard !appMode.isLocal else { return }
        openGeneration += 1
        let generation = openGeneration
        stopFollowing()
        isVisible = true
        if openId != route.id {
            openId = route.id
            transcript = ChatTranscript()
            conversation = nil
            notice = nil
            actionNotices = [:]
            isCancelling = false
            detailState = .idle
        }
        if route.isNew, !knownIds.contains(route.id) {
            detailState = .loaded
            return
        }
        await reload(generation: generation, follow: true)
    }

    /// The screen went away: the stream closes, as the contract asks. A run
    /// still working is watched quietly, so what it changes is still pulled.
    func close(_ conversationId: String) {
        guard openId == conversationId else { return }
        if let run = transcript.activeRun, run.isActive {
            watchRun(in: conversationId, after: transcript.lastSeq)
        }
        isVisible = false
        openGeneration += 1
        stopFollowing()
    }

    /// Back from the background: the stream died with the suspension, so the
    /// conversation is read again and followed from its new `lastSeq`.
    func resume(_ conversationId: String) async {
        guard openId == conversationId, isVisible, knownIds.contains(conversationId) else { return }
        openGeneration += 1
        let generation = openGeneration
        stopFollowing()
        await reload(generation: generation, follow: true)
    }

    func suspend(_ conversationId: String) {
        guard openId == conversationId else { return }
        stopFollowing()
    }

    private var hasTranscript: Bool {
        detailState == .loaded
    }

    /// Reads the open conversation and puts it on screen. A follow that is
    /// running is stopped before the read is applied and started again after,
    /// so it replays from the read's `lastSeq` instead of going on past events
    /// the older read does not have. False when the read failed or was
    /// superseded.
    @discardableResult
    private func reload(generation: Int, follow: Bool) async -> Bool {
        guard let id = openId else { return false }
        let account = self.account
        let previous: ChatTranscript? = hasTranscript ? transcript : nil
        if !hasTranscript {
            detailState = .loading
        }
        do {
            let detail = try await api.getChatConversation(id: id)
            guard isCurrent(account), generation == openGeneration, openId == id else { return false }
            var next = ChatTranscript(detail: detail)
            if let accepted = lastAccepted[id] {
                if accepted.seq > detail.lastSeq {
                    // The read predates the send: keep the message on screen
                    // and replay the events after the read.
                    next.upsert(accepted.message)
                    if accepted.run.isActive {
                        next.adopt(accepted.run)
                    }
                } else {
                    lastAccepted[id] = nil
                }
            }
            next.carryFinishedRuns(from: transcript)
            if let previous {
                let changes = ChatTranscript.finishedToolChanges(from: previous, to: next)
                scheduleRefresh(ChatRefreshPlan(changes: changes), immediately: true)
            }
            let wasFollowing = followTask != nil
            stopFollowing()
            transcript = next
            knownIds.insert(id)
            remember(detail.conversation)
            updateListRun(id, run: detail.activeRun)
            adopt(detail.capability)
            pending.removeAll { message in next.messages.contains { $0.id == message.messageId } }
            if !next.isRunActive {
                isCancelling = false
            }
            notice = nil
            detailState = .loaded
            if follow || wasFollowing {
                followIfNeeded()
            }
            return true
        } catch {
            guard isCurrent(account), generation == openGeneration, openId == id else { return false }
            let failure = ChatNotice.forFailure(error)
            if failure == .conversationMissing {
                forget(id)
            } else if hasTranscript {
                notice = failure
            } else {
                detailState = .failed(failure)
            }
            return false
        }
    }

    func retryLoad() async {
        guard let id = openId else { return }
        await open(ChatRoute(id: id, isNew: false))
    }

    private func followIfNeeded() {
        guard isVisible, followTask == nil, let id = openId, transcript.activeRun != nil else { return }
        followToken += 1
        let token = followToken
        followTask = Task { [weak self] in
            await self?.follow(conversationId: id, token: token)
        }
    }

    /// After a decision, a send or a cancel the run moves on; a poll waiting
    /// out its interval starts over so the screen does not lag behind it.
    private func resumeFollowing() {
        if connection == .polling {
            stopFollowing()
        }
        followIfNeeded()
    }

    private func stopFollowing() {
        followToken += 1
        followTask?.cancel()
        followTask = nil
        connection = .idle
    }

    private func isFollowing(_ conversationId: String, token: Int) -> Bool {
        !Task.isCancelled && token == followToken && openId == conversationId && isVisible
            && transcript.activeRun != nil
    }

    private var isPolling: Bool {
        pollingUntil.map { $0 > Date() } ?? false
    }

    private enum StreamEnd {
        /// The server closed it (the 10-minute cap, a newer stream): reconnect.
        case closed
        /// No run is active any more.
        case idle
        /// The events and the run disagree (a page whose run ended without its
        /// `run_finished`): read the chat again.
        case gap
    }

    /// What one stream connection brought.
    private struct StreamOutcome {
        var end = StreamEnd.closed
        var opened = false
        var sawEvent = false
        var sawHeartbeat = false
        var error: Error?

        /// Answered, then nothing, not even the 20-second ping: something
        /// between the app and the server holds the stream back.
        var wasHeldBack: Bool {
            opened && !sawEvent && !sawHeartbeat && (error != nil || end == .closed)
        }
    }

    private func follow(conversationId: String, token: Int) async {
        defer {
            if token == followToken {
                followTask = nil
                connection = .idle
            }
        }
        var gaps = 0
        while isFollowing(conversationId, token: token) {
            let end: StreamEnd
            if isPolling {
                connection = .polling
                do {
                    end = try await poll(conversationId: conversationId, token: token)
                    followFailures = 0
                } catch {
                    guard isFollowing(conversationId, token: token) else { return }
                    guard await recover(from: error, in: conversationId) else { return }
                    continue
                }
            } else {
                connection = followFailures == 0 ? .connecting : .reconnecting
                let outcome = await stream(conversationId: conversationId, token: token)
                guard isFollowing(conversationId, token: token) else { return }
                if outcome.wasHeldBack {
                    startPolling(reason: "stream_held_back")
                    continue
                }
                if let error = outcome.error {
                    guard await recover(from: error, in: conversationId) else { return }
                    continue
                }
                end = outcome.end
            }
            guard end == .gap else {
                gaps = 0
                continue
            }
            gaps += 1
            if gaps > Self.maxConsecutiveGaps {
                notice = .failed
                ErrorReporter.captureWarning("Chat events kept disagreeing with the run", context: ["gaps": gaps])
                return
            }
            // A read that lands starts a new follow from its `lastSeq`.
            let reloaded = await reload(generation: openGeneration, follow: true)
            if !reloaded, isFollowing(conversationId, token: token) {
                countFollowFailure(reason: "reload_failed")
                await pause(for: Self.backoff(failures: followFailures, base: retryBase))
            }
        }
    }

    /// Acts on a failed stream or poll. False when following has to stop.
    private func recover(from error: Error, in conversationId: String) async -> Bool {
        switch Self.followRecovery(after: error) {
        case .stop:
            notice = ChatNotice.forFailure(error)
            return false
        case .missing:
            forget(conversationId)
            return false
        case let .wait(seconds):
            await pause(for: seconds)
            return true
        case .backOff:
            countFollowFailure(reason: ErrorReporter.reason(for: error))
            await pause(for: Self.backoff(failures: followFailures, base: retryBase))
            return true
        }
    }

    private func countFollowFailure(reason: String) {
        followFailures += 1
        if followFailures >= Self.streamFailuresBeforePolling, !isPolling {
            startPolling(reason: reason)
        }
    }

    private func startPolling(reason: String) {
        pollingUntil = Date().addingTimeInterval(Self.pollingFallbackDuration)
        ErrorReporter.addBreadcrumb("Chat stream fell back to polling", category: "chat", data: ["reason": reason])
    }

    /// Cancellation ends the wait early; the loop condition then stops the loop.
    private func pause(for seconds: TimeInterval) async {
        do {
            try await Task.sleep(for: .seconds(seconds))
        } catch {
            ErrorReporter.addBreadcrumb("Chat follow wait ended", category: "chat", data: [
                "reason": ErrorReporter.reason(for: error)
            ])
        }
    }

    enum FollowRecovery: Equatable {
        case stop
        case missing
        case wait(TimeInterval)
        case backOff
    }

    /// What a failed stream or poll calls for: a dead session or a required
    /// update stops following, a missing conversation is dropped, a rate
    /// limit waits as told, and anything else backs off and tries again.
    nonisolated static func followRecovery(after error: Error) -> FollowRecovery {
        if let failure = error as? ChatFailure {
            switch failure {
            case let .rejected(rejection):
                if rejection.status == 404 { return .missing }
                if rejection.status == 429 { return .wait(rejection.retryAfter ?? 30) }
                if rejection.status == 403 { return .stop }
                return .backOff
            case .transport(.unauthorized), .transport(.updateRequired):
                return .stop
            case .transport:
                return .backOff
            }
        }
        return .backOff
    }

    /// 3 s, then doubling up to 30 s (docs/ai-chat.md §5.1).
    nonisolated static func backoff(failures: Int, base: TimeInterval) -> TimeInterval {
        let exponent = Double(max(0, failures - 1))
        return min(30, max(1, base) * pow(2, exponent))
    }

    /// One connection. Every item is checked against the follow first: an
    /// element still buffered after a cancel must not land in another
    /// conversation, nor reset this one's failure count.
    private func stream(conversationId: String, token: Int) async -> StreamOutcome {
        var outcome = StreamOutcome()
        do {
            try await api.followChatEvents(conversationId: conversationId, after: transcript.lastSeq) { item in
                guard isFollowing(conversationId, token: token) else { return false }
                switch item {
                case .opened:
                    outcome.opened = true
                    connection = .live
                    return true
                case .heartbeat:
                    outcome.sawHeartbeat = true
                    return true
                case let .retry(milliseconds):
                    retryBase = min(30, max(1, Double(milliseconds) / 1000))
                    return true
                case .rejected:
                    return false
                case let .event(message):
                    outcome.sawEvent = true
                    followFailures = 0
                    if let event = Self.decodeEvent(message.data) {
                        receive(event, in: conversationId)
                    }
                    if transcript.activeRun == nil {
                        outcome.end = .idle
                        return false
                    }
                    return true
                }
            }
        } catch {
            outcome.error = error
        }
        return outcome
    }

    private func poll(conversationId: String, token: Int) async throws -> StreamEnd {
        let page = try await api.chatEvents(conversationId: conversationId, after: transcript.lastSeq)
        guard isFollowing(conversationId, token: token) else { return .idle }
        for event in page.events {
            receive(event, in: conversationId)
        }
        if page.hasMore {
            return .closed
        }
        if page.lastSeq > page.nextAfter {
            // Written after the page was read: read again at once. A page that
            // brought nothing yet stays behind has lost events; read the chat.
            return page.events.isEmpty ? .gap : .closed
        }
        if let run = page.activeRun {
            transcript.adopt(run, fromSnapshot: true)
        } else if transcript.activeRun != nil {
            // A page is one snapshot, so this should not happen; the
            // conversation read puts events and run back in step.
            return .gap
        }
        guard let run = transcript.activeRun else { return .idle }
        let wait = run.status == ChatRunStatus.awaitingConfirmation
            ? Self.confirmationPollInterval : Self.activePollInterval
        try await Task.sleep(for: .seconds(wait))
        return .closed
    }

    /// An event that cannot be read is reported and, when its seq can still be
    /// read, kept as an event of an unknown type: the fold moves past it and
    /// following goes on.
    nonisolated static func decodeEvent(_ data: String) -> ChatEvent? {
        let bytes = Data(data.utf8)
        do {
            return try JSONDecoder().decode(ChatEvent.self, from: bytes)
        } catch {
            ErrorReporter.capture(error, context: ["op": "decodeChatEvent", "length": data.count])
            guard let header = try? JSONDecoder().decode(ChatEventHeader.self, from: bytes) else { return nil }
            return ChatEvent(seq: header.seq, type: unreadableEventType)
        }
    }

    /// Applies one event of the open conversation and acts on its effects: the
    /// accepted message leaves the pending list, changed data is refreshed, the
    /// capability is kept. Events of any other conversation are dropped.
    private func receive(_ event: ChatEvent, in conversationId: String) {
        guard openId == conversationId else { return }
        let effect = transcript.apply(event)
        guard effect.outcome == .applied else { return }
        if let messageId = event.message?.id {
            pending.removeAll { $0.messageId == messageId }
        }
        // Every report refreshes again: a second write to the same day (a log,
        // then a confirmed delete) must not be skipped, and `run_finished`
        // repeats the run's whole change set, writes of unknown outcome included.
        let plan = ChatRefreshPlan(changes: effect.changes, changed: effect.changed)
        scheduleRefresh(plan, immediately: effect.finishedRunId != nil)
        if effect.finishedRunId != nil {
            isCancelling = false
            noticeEndedRun(
                status: event.status ?? event.run?.status,
                reason: event.reason ?? event.run?.reason,
                messageId: event.messageId
            )
            updateListRun(conversationId, run: transcript.activeRun)
        }
        adopt(effect.capability)
        if let code = effect.errorCode {
            ErrorReporter.addBreadcrumb("Chat run error", category: "chat", data: ["code": code])
        }
    }

    /// A run that ended before it had a message (cancelled while queued, failed
    /// at once) still says how it ended.
    private func noticeEndedRun(status: String?, reason: String?, messageId: String?) {
        let hasMessage = messageId.map { id in transcript.messages.contains { $0.id == id } } ?? false
        guard !hasMessage, let status, let ended = ChatNotice.forMessage(status: status, reason: reason) else { return }
        notice = ended
    }

    // MARK: - A run left behind

    /// Polls the events of a run the screen stopped following, slowly and only
    /// for the data it changes and the capability, until it ends.
    private func watchRun(in conversationId: String, after: Int) {
        guard runWatches[conversationId] == nil else { return }
        let account = self.account
        runWatches[conversationId] = Task { [weak self] in
            await self?.watch(conversationId: conversationId, after: after, account: account)
        }
    }

    private func watch(conversationId: String, after: Int, account: Int) async {
        defer {
            if isCurrent(account) {
                runWatches[conversationId] = nil
            }
        }
        var cursor = after
        var failures = 0
        let deadline = Date().addingTimeInterval(Self.watchLimit)
        while !Task.isCancelled, isCurrent(account), Date() < deadline {
            var wait = Self.watchPollInterval
            do {
                let page = try await api.chatEvents(conversationId: conversationId, after: cursor)
                guard isCurrent(account) else { return }
                failures = 0
                var ended = false
                for event in page.events {
                    cursor = max(cursor, event.seq)
                    ended = takeLeftBehind(event) || ended
                }
                if page.hasMore || (page.lastSeq > page.nextAfter && !page.events.isEmpty) { continue }
                if ended || page.activeRun?.isActive != true {
                    updateListRun(conversationId, run: nil)
                    return
                }
                if page.activeRun?.status == ChatRunStatus.awaitingConfirmation {
                    wait = Self.confirmationPollInterval
                }
            } catch {
                guard isCurrent(account) else { return }
                switch Self.followRecovery(after: error) {
                case .stop, .missing:
                    return
                case let .wait(seconds):
                    wait = seconds
                case .backOff:
                    failures += 1
                    wait = Self.backoff(failures: failures, base: retryBase)
                }
            }
            try? await Task.sleep(for: .seconds(wait))
        }
    }

    /// The refresh and capability half of an event of a run left behind.
    /// True for its `run_finished`.
    private func takeLeftBehind(_ event: ChatEvent) -> Bool {
        switch event.type {
        case ChatEventType.toolFinished:
            scheduleRefresh(ChatRefreshPlan(changes: event.changes ?? [], changed: event.changed ?? []))
            return false
        case ChatEventType.runFinished:
            scheduleRefresh(
                ChatRefreshPlan(
                    changes: event.changes ?? event.run?.changes ?? [],
                    changed: event.changed ?? event.run?.changed ?? []
                ),
                immediately: true
            )
            adopt(event.capability)
            return true
        default:
            return false
        }
    }

    // MARK: - Data refresh

    private func scheduleRefresh(_ plan: ChatRefreshPlan, immediately: Bool = false) {
        guard !plan.isEmpty else { return }
        pendingPlan.formUnion(plan)
        flushTask?.cancel()
        let delay: Duration = immediately ? .milliseconds(100) : .milliseconds(800)
        flushTask = Task { [weak self] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }
            self?.flushRefresh()
        }
    }

    private func flushRefresh() {
        let plan = pendingPlan
        pendingPlan = ChatRefreshPlan()
        guard !plan.isEmpty, let refreshData else { return }
        let account = self.account
        let previous = refreshTask
        refreshTask = Task { [weak self] in
            await previous?.value
            guard let self, isCurrent(account) else { return }
            await refreshData(plan) { [weak self] in
                self?.account == account
            }
            guard isCurrent(account) else { return }
            NotificationCenter.default.post(name: Self.didChangeDataNotification, object: nil)
        }
    }

    // MARK: - Sending

    /// Shows the message at once and sends it. Online only: a failure stays on
    /// screen with a retry that reuses the same message id.
    func send(text: String, images: [UIImage], in conversationId: String, contextDate: String?) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !appMode.isLocal, !trimmed.isEmpty, ChatLimits.length(trimmed) <= ChatLimits.maxTextLength else { return }
        let message = ChatPendingMessage(
            id: UUID(),
            messageId: UUID().uuidString.lowercased(),
            conversationId: conversationId,
            text: trimmed,
            images: Array(images.prefix(ChatLimits.maxPhotosPerMessage)),
            imageFilenames: images.isEmpty ? [] : nil,
            context: ChatMessageContext(
                date: contextDate,
                timezone: TimeZone.current.identifier,
                locale: L10n.currentLocale.rawValue
            ),
            state: .sending
        )
        pending.append(message)
        notice = nil
        setDraft("", for: conversationId)
        attachmentDrafts[conversationId] = nil
        Task { await deliver(message.id) }
    }

    func retry(_ localId: UUID) {
        guard let index = pending.firstIndex(where: { $0.id == localId }) else { return }
        guard case .failed = pending[index].state else { return }
        pending[index].state = .sending
        Task { await deliver(localId) }
    }

    /// Drops a message that did not go out and hands back its text and photos
    /// for the composer. When the last attempt may have landed, the
    /// conversation is read first: a message that did land stays (the read
    /// shows it), and one that cannot be checked is kept, so sending the text
    /// again cannot post it twice.
    func discard(_ localId: UUID) async -> ChatPendingMessage? {
        guard let message = pending.first(where: { $0.id == localId }) else { return nil }
        if message.mayHaveLanded, knownIds.contains(message.conversationId) {
            guard openId == message.conversationId,
                  await reload(generation: openGeneration, follow: true)
            else { return nil }
        }
        guard let index = pending.firstIndex(where: { $0.id == localId }) else { return nil }
        return pending.remove(at: index)
    }

    /// A new chat that takes over a message a full chat refused, photos included.
    func moveToNewChat(_ localId: UUID) -> ChatRoute {
        guard let index = pending.firstIndex(where: { $0.id == localId }) else { return startNewChat() }
        let message = pending.remove(at: index)
        let route = startNewChat(carrying: message.text)
        setAttachments(message.images, for: route.id)
        return route
    }

    private func updatePending(_ localId: UUID, _ change: (inout ChatPendingMessage) -> Void) {
        guard let index = pending.firstIndex(where: { $0.id == localId }) else { return }
        change(&pending[index])
    }

    private func deliver(_ localId: UUID) async {
        guard var message = pending.first(where: { $0.id == localId }) else { return }
        let account = self.account
        // The store owns the send, so leaving the screen does not cancel it;
        // this keeps it going for the seconds iOS grants after leaving the app.
        sendTasks[localId] = UIApplication.shared.beginBackgroundTask(withName: "chat-send") { [weak self] in
            self?.endSendTask(localId)
        }
        defer { endSendTask(localId) }
        var sending = false
        do {
            if !knownIds.contains(message.conversationId) {
                let created = try await api.createChatConversation(id: message.conversationId)
                guard isCurrent(account) else { return }
                knownIds.insert(created.id)
                remember(created)
            }
            await prepareToSend?()
            if message.imageFilenames == nil {
                let filenames = try await upload(message.images)
                guard isCurrent(account) else { return }
                message.imageFilenames = filenames
                updatePending(localId) { $0.imageFilenames = filenames }
            }
            let filenames = message.imageFilenames ?? []
            sending = true
            let accepted = try await api.sendChatMessage(
                conversationId: message.conversationId,
                ChatMessageCreate(
                    id: message.messageId,
                    text: message.text,
                    imageFilenames: filenames.isEmpty ? nil : filenames,
                    context: message.context
                )
            )
            guard isCurrent(account) else { return }
            accept(accepted, for: message)
        } catch {
            guard isCurrent(account) else { return }
            fail(localId, message: message, error: error, afterSending: sending)
        }
    }

    private func endSendTask(_ localId: UUID) {
        guard let token = sendTasks.removeValue(forKey: localId) else { return }
        UIApplication.shared.endBackgroundTask(token)
    }

    private func accept(_ accepted: ChatMessageAcceptedResponse, for message: ChatPendingMessage) {
        let conversationId = message.conversationId
        pending.removeAll { $0.id == message.id }
        updateListRun(conversationId, run: accepted.run)
        if let index = conversations.firstIndex(where: { $0.id == conversationId }) {
            conversations[index].lastMessageAt = accepted.message.createdAt ?? conversations[index].lastMessageAt
            let untitled = conversations[index].title == nil
            conversations = Self.sortedNewestFirst(conversations)
            if untitled {
                // The first message names the chat on the server.
                Task { await loadConversations() }
            }
        }
        lastAccepted[conversationId] = accepted
        guard openId == conversationId else { return }
        transcript.upsert(accepted.message)
        if accepted.run.isActive {
            transcript.adopt(accepted.run)
            resumeFollowing()
        } else {
            // A retry answered from the first attempt, whose run already
            // ended; one that ended before it had an answer says how.
            let run = accepted.run
            Task {
                guard await reload(generation: openGeneration, follow: true), openId == conversationId else { return }
                noticeEndedRun(status: run.status, reason: run.reason, messageId: run.assistantMessageId)
            }
        }
    }

    private func fail(_ localId: UUID, message: ChatPendingMessage, error: Error, afterSending: Bool) {
        let failure = ChatNotice.forFailure(error)
        let rejection = (error as? ChatFailure)?.rejection
        let mayHaveLanded = afterSending && Self.mayHaveLanded(error)
        updatePending(localId) { $0.mayHaveLanded = mayHaveLanded }
        adopt(rejection?.body?.capability)
        if rejection?.code == "message_id_conflict" {
            updatePending(localId) { $0.messageId = UUID().uuidString.lowercased() }
        }
        updatePending(localId) { $0.state = .failed(failure) }
        if rejection?.code == "run_active", openId == message.conversationId {
            Task { await reload(generation: openGeneration, follow: true) }
        }
        ErrorReporter.addBreadcrumb("Chat message not sent", category: "chat", data: [
            "reason": ErrorReporter.reason(for: error),
            "code": rejection?.code ?? "none",
            "photo_count": message.images.count
        ])
    }

    /// No answer to read (the connection dropped, a 5xx, an unreadable body):
    /// the server may have taken the message. A coded rejection, a 401 or an
    /// update gate means it did not.
    nonisolated static func mayHaveLanded(_ error: Error) -> Bool {
        switch error as? ChatFailure {
        case let .rejected(rejection):
            return rejection.status >= 500
        case .transport(.unauthorized), .transport(.updateRequired):
            return false
        case .transport:
            return true
        case nil:
            return !(error is CancellationError)
        }
    }

    /// The same photo path as an AI task: encoded off the main thread at the
    /// size the server keeps, uploaded in one request.
    private func upload(_ images: [UIImage]) async throws -> [String] {
        guard !images.isEmpty else { return [] }
        let maxDimension = Self.photoMaxDimension
        let quality = Self.photoQuality
        let encoded: [Data] = await Task.detached(priority: .userInitiated) {
            images.compactMap { $0.downscaledJPEGData(maxDimension: maxDimension, quality: quality) }
        }.value
        if encoded.count != images.count {
            ErrorReporter.captureWarning("Chat photos dropped while encoding", context: [
                "picked": images.count,
                "encoded": encoded.count
            ])
        }
        guard !encoded.isEmpty else { return [] }
        return try await api.uploadAiTaskPhotos(
            encoded.enumerated().map { (data: $0.element, filename: "chat_\($0.offset).jpg") }
        )
    }

    // MARK: - Confirmations and cancel

    /// Applied only to the conversation that asked: a late answer must not
    /// make another conversation follow this run, where Stop would cancel it.
    func decide(actionId: String, approve: Bool) async {
        guard !actionsInFlight.contains(actionId), let conversationId = openId else { return }
        let account = self.account
        actionsInFlight.insert(actionId)
        actionNotices[actionId] = nil
        defer { actionsInFlight.remove(actionId) }
        do {
            let response = try await api.decideChatAction(id: actionId, approve: approve)
            guard isCurrent(account), openId == conversationId,
                  response.run.conversationId.map({ $0 == conversationId }) ?? true
            else { return }
            transcript.applyDecision(response.action)
            transcript.adopt(response.run)
            resumeFollowing()
        } catch {
            guard isCurrent(account), openId == conversationId else { return }
            actionNotices[actionId] = ChatNotice.forFailure(error)
            guard let rejection = (error as? ChatFailure)?.rejection else { return }
            if let action = rejection.body?.action {
                transcript.applyDecision(action)
            }
            if rejection.status == 404 || rejection.status == 409 {
                await reload(generation: openGeneration, follow: true)
            }
        }
    }

    func cancelRun() async {
        guard let run = transcript.activeRun, run.isActive, !isCancelling, let conversationId = openId else { return }
        let account = self.account
        isCancelling = true
        do {
            let cancelled = try await api.cancelChatRun(id: run.id)
            guard isCurrent(account), openId == conversationId else { return }
            // `adopt` ignores a run whose `run_finished` already came.
            if transcript.activeRun?.id == cancelled.id {
                transcript.adopt(cancelled)
            }
            if !cancelled.isActive {
                isCancelling = false
            }
            resumeFollowing()
        } catch {
            guard isCurrent(account), openId == conversationId else { return }
            isCancelling = false
            let rejection = (error as? ChatFailure)?.rejection
            if rejection?.status == 404 || rejection?.status == 409 {
                await reload(generation: openGeneration, follow: true)
            } else {
                notice = ChatNotice.forFailure(error)
            }
        }
    }

    // MARK: - Account

    /// Forgets everything that belongs to the account; called on sign-out and
    /// a mode change. Work still out for it drops its result.
    func resetAccountState() {
        account += 1
        stopFollowing()
        openGeneration += 1
        for watch in runWatches.values {
            watch.cancel()
        }
        runWatches = [:]
        flushTask?.cancel()
        flushTask = nil
        pendingPlan = ChatRefreshPlan()
        followFailures = 0
        pollingUntil = nil
        conversations = []
        hasLoadedList = false
        listNotice = nil
        openId = nil
        conversation = nil
        transcript = ChatTranscript()
        detailState = .idle
        pending = []
        notice = nil
        actionsInFlight = []
        actionNotices = [:]
        isCancelling = false
        knownIds = []
        lastAccepted = [:]
        drafts = [:]
        attachmentDrafts = [:]
        defaults.removeObject(forKey: Self.draftsKey)
    }
}
