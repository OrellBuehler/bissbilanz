import SwiftUI

/// One conversation with the assistant: the transcript anchored to the
/// bottom, the live answer as it streams, confirmation cards, and the
/// composer. Follows the run only while this screen is on screen and the app
/// is in the foreground; coming back reads the conversation again.
struct ChatConversationView: View {
    let route: ChatRoute
    var contextDate: String?
    /// Replaces this conversation with another one (a new chat).
    var onOpen: (ChatRoute) -> Void

    @Environment(ChatStore.self) private var store
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @AppStorage(ChatStore.privacyAcknowledgedKey) private var privacyAcknowledged = false
    @State private var seed: ChatComposerSeed?
    @State private var isNearBottom = true
    @State private var wasBackgrounded = false
    @State private var showAbout = false
    @State private var showRename = false
    @State private var renameText = ""
    @State private var showDelete = false
    @State private var errorMessage: String?

    private static let bottomId = "chat-bottom"

    private var isCurrent: Bool {
        store.openId == route.id
    }

    private var messages: [ChatMessage] {
        isCurrent ? store.transcript.messages : []
    }

    private var pending: [ChatPendingMessage] {
        store.pending.filter { $0.conversationId == route.id }
    }

    private var activeRun: ChatRun? {
        isCurrent ? store.transcript.activeRun : nil
    }

    private var title: String {
        if isCurrent, let title = store.conversation?.title, !title.isEmpty {
            return title
        }
        return store.conversations.first { $0.id == route.id }?.title ?? L10n.chatNewChat
    }

    var body: some View {
        content
            .safeAreaInset(edge: .bottom, spacing: 0) {
                composerArea
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    menu
                }
            }
            .task(id: route.id) {
                await store.open(route)
            }
            .onDisappear {
                store.close(route.id)
            }
            .onChange(of: scenePhase) { _, phase in
                if phase == .background {
                    wasBackgrounded = true
                    store.suspend(route.id)
                } else if phase == .active, wasBackgrounded {
                    wasBackgrounded = false
                    Task { await store.resume(route.id) }
                }
            }
            .sheet(isPresented: $showAbout) {
                ChatAboutSheet()
            }
            .alert(L10n.chatRenameTitle, isPresented: $showRename) {
                TextField(L10n.chatTitlePlaceholder, text: $renameText)
                Button(L10n.save) {
                    Task { await rename() }
                }
                Button(L10n.cancel, role: .cancel) {}
            }
            .confirmationDialog(L10n.chatDeleteTitle, isPresented: $showDelete, titleVisibility: .visible) {
                Button(L10n.delete, role: .destructive) {
                    Task { await delete() }
                }
            } message: {
                Text(L10n.chatDeleteMessage)
            }
            .alert(
                L10n.error,
                isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
            ) {
                Button(L10n.ok, role: .cancel) {}
            } message: {
                if let errorMessage { Text(errorMessage) }
            }
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if isCurrent, store.detailState == .missing {
            ContentUnavailableView(
                L10n.chatNotice(.conversationMissing),
                systemImage: ChatSymbols.chat
            )
        } else if isCurrent, case let .failed(notice) = store.detailState, messages.isEmpty {
            ChatLoadFailedView(notice: notice) {
                Task { await store.retryLoad() }
            }
        } else if !isCurrent || (store.detailState != .loaded && messages.isEmpty) {
            LoadingView()
        } else {
            transcript
        }
    }

    private var transcript: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 18) {
                    transcriptRows
                    Color.clear
                        .frame(height: 1)
                        .id(Self.bottomId)
                }
                .padding(.horizontal)
                .padding(.vertical, 12)
            }
            .defaultScrollAnchor(.bottom)
            .scrollDismissesKeyboard(.interactively)
            .onScrollGeometryChange(for: Bool.self) { geometry in
                geometry.visibleRect.maxY >= geometry.contentSize.height - 120
            } action: { _, nearBottom in
                isNearBottom = nearBottom
            }
            .onChange(of: scrollSignature) { _, _ in
                guard isNearBottom else { return }
                if reduceMotion {
                    proxy.scrollTo(Self.bottomId, anchor: .bottom)
                } else {
                    withAnimation(.easeOut(duration: 0.2)) {
                        proxy.scrollTo(Self.bottomId, anchor: .bottom)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var transcriptRows: some View {
        if !privacyAcknowledged {
            ChatPrivacyCard {
                privacyAcknowledged = true
            }
        }
        if messages.isEmpty, pending.isEmpty {
            ChatEmptyState(isEnabled: store.unavailableNotice == nil, onSelect: select)
        }
        ForEach(messages) { message in
            ChatMessageView(message: message, onNewChat: { startNewChat() })
        }
        ForEach(pending) { message in
            ChatPendingMessageView(
                message: message,
                onRetry: { store.retry(message.id) },
                onDiscard: { discard(message.id) },
                onNewChat: { startNewChatCarrying(message.text) }
            )
        }
        if let thinking = thinkingText {
            ChatThinkingRow(text: thinking)
        }
        if isCurrent, let notice = store.notice {
            ChatNoticeRow(notice: notice, onNewChat: { startNewChat() })
        }
    }

    /// Changes whenever the transcript grows, including streamed text.
    private var scrollSignature: [Int] {
        let last = messages.last
        let lastText = last?.parts.last?.text?.count ?? 0
        return [messages.count, last?.parts.count ?? 0, lastText, pending.count, thinkingText == nil ? 0 : 1]
    }

    /// The run works on something not on screen yet: before its first part,
    /// or after a finished tool call. A running tool shows its own spinner and
    /// streaming text speaks for itself.
    private var thinkingText: String? {
        guard let run = activeRun, run.isActive, run.status != ChatRunStatus.awaitingConfirmation else { return nil }
        if store.connection == .reconnecting {
            return L10n.chatReconnecting
        }
        if run.status == ChatRunStatus.queued {
            return L10n.chatQueued
        }
        guard let last = messages.last, !last.isFromUser else { return L10n.chatThinking }
        guard let part = last.parts.last(where: { $0.type != ChatMessagePart.placeholderType }) else {
            return L10n.chatThinking
        }
        if part.type == ChatMessagePart.textType {
            return nil
        }
        if part.type == ChatMessagePart.toolType, part.status == "running" {
            return nil
        }
        return L10n.chatThinking
    }

    // MARK: - Composer

    @ViewBuilder
    private var composerArea: some View {
        VStack(spacing: 0) {
            Divider()
            if let unavailable = store.unavailableNotice {
                ChatUnavailableBanner(notice: unavailable)
                    .padding(.horizontal)
                    .padding(.top, 10)
            }
            ChatComposer(
                conversationId: route.id,
                isEnabled: store.unavailableNotice == nil,
                isAnswering: isAnswering,
                isWaiting: activeRun?.status == ChatRunStatus.awaitingConfirmation,
                isStopping: store.isCancelling,
                seed: $seed,
                onSend: send,
                onStop: { Task { await store.cancelRun() } }
            )
            .id(route.id)
        }
        .background(.bar)
    }

    private var isAnswering: Bool {
        guard let run = activeRun, run.isActive else { return false }
        return run.status != ChatRunStatus.awaitingConfirmation
    }

    // MARK: - Menu

    private var menu: some View {
        Menu {
            Button {
                startNewChat()
            } label: {
                Label(L10n.chatNewChat, systemImage: ChatSymbols.newChat)
            }
            Button {
                renameText = title == L10n.chatNewChat ? "" : title
                showRename = true
            } label: {
                Label(L10n.chatRename, systemImage: "pencil")
            }
            Button {
                showAbout = true
            } label: {
                Label(L10n.chatAbout, systemImage: "info.circle")
            }
            Divider()
            Button(role: .destructive) {
                showDelete = true
            } label: {
                Label(L10n.delete, systemImage: "trash")
            }
        } label: {
            Image(systemName: "ellipsis.circle")
                .accessibilityLabel(L10n.chatMoreActions)
        }
    }

    // MARK: - Actions

    private func send(_ text: String, _ images: [UIImage]) {
        store.send(text: text, images: images, in: route.id, contextDate: contextDate)
    }

    private func select(_ suggestion: ChatSuggestion) {
        if suggestion.sendsImmediately {
            send(suggestion.prompt, [])
        } else {
            seed = ChatComposerSeed(text: suggestion.prompt)
        }
    }

    private func discard(_ localId: UUID) {
        guard let message = store.discard(localId) else { return }
        if store.draft(for: route.id).isEmpty {
            seed = ChatComposerSeed(text: message.text, images: message.images)
        }
    }

    private func startNewChat() {
        onOpen(store.startNewChat())
    }

    private func startNewChatCarrying(_ text: String) {
        onOpen(store.startNewChat(carrying: text))
    }

    private func rename() async {
        if let notice = await store.renameConversation(id: route.id, title: renameText) {
            errorMessage = notice.message
        }
    }

    private func delete() async {
        if let notice = await store.deleteConversation(id: route.id) {
            errorMessage = notice.message
        } else {
            dismiss()
        }
    }
}

struct ChatLoadFailedView: View {
    let notice: ChatNotice
    let retry: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label(L10n.somethingWentWrong, systemImage: "exclamationmark.triangle")
        } description: {
            Text(notice.message)
        } actions: {
            Button(L10n.retry, action: retry)
                .buttonStyle(.bordered)
        }
    }
}
