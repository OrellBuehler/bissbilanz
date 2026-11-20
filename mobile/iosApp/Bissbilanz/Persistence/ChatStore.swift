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

/// The assistant chat, in memory: the conversation list and the open
/// conversation, folded from its read and the events after it. Chat is online
/// only; nothing here goes through the sync queue. The open conversation
/// follows its run over server-sent events, falls back to polling when the
/// stream keeps failing, and stops once no run is active or the screen closes.
@MainActor
@Observable
final class ChatStore {
    private let api: BissbilanzAPI
    private let appMode: AppModeManager
    private let preferences: PreferencesRepository
    private let defaults: UserDefaults

    /// Uploads the offline queue before a send, so the assistant sees local edits.
    @ObservationIgnored var prepareToSend: (@MainActor () async -> Void)?
    /// Runs the refreshes a plan names; set once by the app.
    @ObservationIgnored var refreshData: (@MainActor (ChatRefreshPlan) async -> Void)?

    /// Posted after the diary data the assistant changed was pulled again.
    nonisolated static let didChangeDataNotification = Notification.Name("ChatStoreDidChangeData")
    nonisolated static let draftsKey = "chat_drafts"
    nonisolated static let privacyAcknowledgedKey = "chat_privacy_acknowledged"
    nonisolated static let streamFailuresBeforePolling = 3
    nonisolated static let maxConsecutiveGaps = 3
    nonisolated static let activePollInterval: TimeInterval = 1.5
    nonisolated static let confirmationPollInterval: TimeInterval = 30
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
    /// A failure outside a send: a cancel, a re-read, the stream giving up.
    private(set) var notice: ChatNotice?
    private(set) var actionsInFlight: Set<String> = []
    private(set) var actionNotices: [String: ChatNotice] = [:]
    private(set) var isCancelling = false

    /// The diary day the dashboard shows, sent as the message context.
    var viewedDiaryDate: String?

    @ObservationIgnored private var drafts: [String: String]
    @ObservationIgnored private var attachmentDrafts: [String: [UIImage]] = [:]
    /// Conversations the server is known to have, so a new chat is created once.
    @ObservationIgnored private var knownIds: Set<String> = []
    @ObservationIgnored private var isVisible = false
    @ObservationIgnored private var openGeneration = 0
    @ObservationIgnored private var followTask: Task<Void, Never>?
    @ObservationIgnored private var followToken = 0
    @ObservationIgnored private var retryBase: TimeInterval = 3
    @ObservationIgnored private var pendingPlan = ChatRefreshPlan()
    /// What each run's tool calls already refreshed, subtracted from its `run_finished`.
    @ObservationIgnored private var runPlans: [String: ChatRefreshPlan] = [:]
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
        do {
            let response = try await api.listChatConversations()
            conversations = Self.sortedNewestFirst(response.conversations)
            knownIds.formUnion(response.conversations.map(\.id))
            listNotice = nil
        } catch {
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
        do {
            let renamed: ChatConversation
            if knownIds.contains(id) {
                renamed = try await api.renameChatConversation(id: id, title: newTitle)
            } else {
                renamed = try await api.createChatConversation(id: id, title: newTitle)
                knownIds.insert(id)
            }
            remember(renamed)
            return nil
        } catch {
            return ChatNotice.forFailure(error)
        }
    }

    func deleteConversation(id: String) async -> ChatNotice? {
        if knownIds.contains(id) {
            do {
                try await api.deleteChatConversation(id: id)
            } catch let failure as ChatFailure where failure.rejection?.status == 404 {
                ErrorReporter.addBreadcrumb("Chat already deleted", category: "chat", data: ["status": 404])
            } catch {
                return ChatNotice.forFailure(error)
            }
        }
        forget(id)
        return nil
    }

    private func forget(_ id: String) {
        conversations.removeAll { $0.id == id }
        knownIds.remove(id)
        pending.removeAll { $0.conversationId == id }
        setDraft("", for: id)
        attachmentDrafts[id] = nil
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

    /// The screen went away: the stream closes, as the contract asks.
    func close(_ conversationId: String) {
        guard openId == conversationId else { return }
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

    /// False when the read failed or was superseded.
    @discardableResult
    private func reload(generation: Int, follow: Bool) async -> Bool {
        guard let id = openId else { return false }
        let previous: ChatTranscript? = hasTranscript ? transcript : nil
        if !hasTranscript {
            detailState = .loading
        }
        do {
            let detail = try await api.getChatConversation(id: id)
            guard generation == openGeneration, openId == id else { return false }
            let next = ChatTranscript(detail: detail)
            if let previous {
                let changes = ChatTranscript.finishedToolChanges(from: previous, to: next)
                scheduleRefresh(ChatRefreshPlan(changes: changes), immediately: true)
            }
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
            if follow {
                followIfNeeded()
            }
            return true
        } catch {
            guard generation == openGeneration, openId == id else { return false }
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

    private enum StreamEnd {
        /// The server closed it (the 10-minute cap, a newer stream): reconnect.
        case closed
        /// No run is active any more.
        case idle
        /// Events are missing: read the conversation again.
        case gap
    }

    private func follow(conversationId: String, token: Int) async {
        defer {
            if token == followToken {
                followTask = nil
                connection = .idle
            }
        }
        var failures = 0
        var gaps = 0
        var polling = false
        while isFollowing(conversationId, token: token) {
            do {
                let end: StreamEnd
                if polling {
                    connection = .polling
                    end = try await poll(conversationId: conversationId, token: token)
                } else {
                    connection = failures == 0 ? .connecting : .reconnecting
                    let startedAt = Date()
                    end = try await stream(conversationId: conversationId, token: token)
                    if end == .closed, Date().timeIntervalSince(startedAt) < 2 {
                        failures += 1
                        try await Task.sleep(for: .seconds(Self.backoff(failures: failures, base: retryBase)))
                        continue
                    }
                }
                guard end == .gap else {
                    failures = 0
                    gaps = 0
                    continue
                }
                gaps += 1
                if gaps > Self.maxConsecutiveGaps {
                    notice = .failed
                    ErrorReporter.captureWarning("Chat events kept arriving out of order", context: ["gaps": gaps])
                    return
                }
                if await reload(generation: openGeneration, follow: false) {
                    failures = 0
                } else {
                    failures += 1
                    await pause(for: Self.backoff(failures: failures, base: retryBase))
                }
            } catch {
                guard isFollowing(conversationId, token: token) else { return }
                switch Self.followRecovery(after: error) {
                case .stop:
                    notice = ChatNotice.forFailure(error)
                    return
                case .missing:
                    forget(conversationId)
                    return
                case let .wait(seconds):
                    await pause(for: seconds)
                case .backOff:
                    failures += 1
                    if failures >= Self.streamFailuresBeforePolling, !polling {
                        polling = true
                        ErrorReporter.addBreadcrumb("Chat stream fell back to polling", category: "chat", data: [
                            "reason": ErrorReporter.reason(for: error)
                        ])
                    }
                    await pause(for: Self.backoff(failures: failures, base: retryBase))
                }
            }
        }
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

    private func stream(conversationId: String, token: Int) async throws -> StreamEnd {
        var end = StreamEnd.closed
        try await api.followChatEvents(conversationId: conversationId, after: transcript.lastSeq) { item in
            switch item {
            case .opened:
                connection = .live
                return true
            case let .retry(milliseconds):
                retryBase = min(30, max(1, Double(milliseconds) / 1000))
                return true
            case .rejected:
                return false
            case let .event(message):
                guard let event = Self.decodeEvent(message.data) else {
                    end = .gap
                    return false
                }
                if receive(event) == .gap {
                    end = .gap
                    return false
                }
                if transcript.activeRun == nil {
                    end = .idle
                    return false
                }
                return isFollowing(conversationId, token: token)
            }
        }
        return end
    }

    private func poll(conversationId: String, token: Int) async throws -> StreamEnd {
        let page = try await api.chatEvents(conversationId: conversationId, after: transcript.lastSeq)
        guard isFollowing(conversationId, token: token) else { return .idle }
        for event in page.events {
            if receive(event) == .gap {
                return .gap
            }
        }
        if page.hasMore {
            return .closed
        }
        if let run = page.activeRun {
            transcript.adopt(run)
        } else if transcript.activeRun != nil {
            // The run ended between the events read and the run read; the
            // conversation read has both in step.
            return .gap
        }
        guard let run = transcript.activeRun else { return .idle }
        let wait = run.status == ChatRunStatus.awaitingConfirmation
            ? Self.confirmationPollInterval : Self.activePollInterval
        try await Task.sleep(for: .seconds(wait))
        return .closed
    }

    nonisolated static func decodeEvent(_ data: String) -> ChatEvent? {
        do {
            return try JSONDecoder().decode(ChatEvent.self, from: Data(data.utf8))
        } catch {
            ErrorReporter.capture(error, context: ["op": "decodeChatEvent", "length": data.count])
            return nil
        }
    }

    /// Applies one event and acts on its effects: the accepted message leaves
    /// the pending list, changed data is refreshed, the capability is kept.
    @discardableResult
    private func receive(_ event: ChatEvent) -> ChatEventOutcome {
        let effect = transcript.apply(event)
        guard effect.outcome == .applied else { return effect.outcome }
        if let messageId = event.message?.id {
            pending.removeAll { $0.messageId == messageId }
        }
        let plan = ChatRefreshPlan(changes: effect.changes, changed: effect.changed)
        if let runId = effect.finishedRunId {
            let alreadyRefreshed = runPlans.removeValue(forKey: runId) ?? ChatRefreshPlan()
            scheduleRefresh(plan.subtracting(alreadyRefreshed), immediately: true)
            isCancelling = false
            if let id = openId {
                updateListRun(id, run: transcript.activeRun)
            }
        } else if !plan.isEmpty {
            if let runId = event.runId {
                runPlans[runId, default: ChatRefreshPlan()].formUnion(plan)
            }
            scheduleRefresh(plan)
        }
        adopt(effect.capability)
        if let code = effect.errorCode {
            ErrorReporter.addBreadcrumb("Chat run error", category: "chat", data: ["code": code])
        }
        return .applied
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
        let previous = refreshTask
        refreshTask = Task {
            await previous?.value
            await refreshData(plan)
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
                date: contextDate ?? viewedDiaryDate,
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
    /// for the composer.
    func discard(_ localId: UUID) -> ChatPendingMessage? {
        guard let index = pending.firstIndex(where: { $0.id == localId }) else { return nil }
        return pending.remove(at: index)
    }

    private func updatePending(_ localId: UUID, _ change: (inout ChatPendingMessage) -> Void) {
        guard let index = pending.firstIndex(where: { $0.id == localId }) else { return }
        change(&pending[index])
    }

    private func deliver(_ localId: UUID) async {
        guard var message = pending.first(where: { $0.id == localId }) else { return }
        do {
            if !knownIds.contains(message.conversationId) {
                let created = try await api.createChatConversation(id: message.conversationId)
                knownIds.insert(created.id)
                remember(created)
            }
            await prepareToSend?()
            if message.imageFilenames == nil {
                let filenames = try await upload(message.images)
                message.imageFilenames = filenames
                updatePending(localId) { $0.imageFilenames = filenames }
            }
            let filenames = message.imageFilenames ?? []
            let accepted = try await api.sendChatMessage(
                conversationId: message.conversationId,
                ChatMessageCreate(
                    id: message.messageId,
                    text: message.text,
                    imageFilenames: filenames.isEmpty ? nil : filenames,
                    context: message.context
                )
            )
            accept(accepted, for: message)
        } catch {
            fail(localId, message: message, error: error)
        }
    }

    private func accept(_ accepted: ChatMessageAcceptedResponse, for message: ChatPendingMessage) {
        pending.removeAll { $0.id == message.id }
        updateListRun(message.conversationId, run: accepted.run)
        if let index = conversations.firstIndex(where: { $0.id == message.conversationId }) {
            conversations[index].lastMessageAt = accepted.message.createdAt ?? conversations[index].lastMessageAt
            let untitled = conversations[index].title == nil
            conversations = Self.sortedNewestFirst(conversations)
            if untitled {
                // The first message names the chat on the server.
                Task { await loadConversations() }
            }
        }
        guard openId == message.conversationId else { return }
        transcript.upsert(accepted.message)
        if accepted.run.isActive {
            transcript.adopt(accepted.run)
            followIfNeeded()
        } else {
            // A retry answered from the first attempt, whose run already ended.
            Task { await reload(generation: openGeneration, follow: true) }
        }
    }

    private func fail(_ localId: UUID, message: ChatPendingMessage, error: Error) {
        let failure = ChatNotice.forFailure(error)
        let rejection = (error as? ChatFailure)?.rejection
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

    func decide(actionId: String, approve: Bool) async {
        guard !actionsInFlight.contains(actionId) else { return }
        actionsInFlight.insert(actionId)
        actionNotices[actionId] = nil
        defer { actionsInFlight.remove(actionId) }
        do {
            let response = try await api.decideChatAction(id: actionId, approve: approve)
            transcript.applyDecision(response.action)
            transcript.adopt(response.run)
            followIfNeeded()
        } catch {
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
        guard let run = transcript.activeRun, run.isActive, !isCancelling else { return }
        isCancelling = true
        do {
            let cancelled = try await api.cancelChatRun(id: run.id)
            if transcript.activeRun?.id == cancelled.id {
                transcript.adopt(cancelled)
            }
            followIfNeeded()
        } catch {
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
    /// a mode change.
    func resetAccountState() {
        stopFollowing()
        openGeneration += 1
        flushTask?.cancel()
        flushTask = nil
        pendingPlan = ChatRefreshPlan()
        runPlans = [:]
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
        viewedDiaryDate = nil
        knownIds = []
        drafts = [:]
        attachmentDrafts = [:]
        defaults.removeObject(forKey: Self.draftsKey)
    }
}
