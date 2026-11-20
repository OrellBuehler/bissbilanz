import SwiftUI

/// The assistant chat's start: the conversations, most recently active first,
/// with new chat, rename and delete. With no conversation yet it goes
/// straight to a new chat. Needs an account; in Local mode it says so.
struct ChatHomeView: View {
    /// The diary day the screen that opened the chat shows, sent as context.
    var contextDate: String?

    @Environment(ChatStore.self) private var store
    @Environment(AppModeManager.self) private var appModeManager
    @Environment(PreferencesRepository.self) private var preferencesRepository
    @State private var openChat: ChatRoute?
    @State private var didOpenFirstChat = false
    @State private var renameTarget: ChatConversationListItem?
    @State private var showRename = false
    @State private var renameText = ""
    @State private var deleting: ChatConversationListItem?
    @State private var errorMessage: String?

    var body: some View {
        Group {
            if appModeManager.isLocal {
                ContentUnavailableView(
                    L10n.chatTabLabel,
                    systemImage: ChatSymbols.chat,
                    description: Text(L10n.chatSignInRequired)
                )
            } else {
                content
            }
        }
        .navigationTitle(L10n.chatListTitle)
        .toolbar {
            if !appModeManager.isLocal {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        openChat = store.startNewChat()
                    } label: {
                        Label(L10n.chatNewChat, systemImage: ChatSymbols.newChat)
                    }
                }
            }
        }
        .navigationDestination(item: $openChat) { route in
            ChatConversationView(route: route, contextDate: contextDate) { next in
                openChat = next
            }
            .id(route.id)
        }
        .task {
            await load()
        }
        .alert(L10n.chatRenameTitle, isPresented: $showRename) {
            TextField(L10n.chatTitlePlaceholder, text: $renameText)
            Button(L10n.save) {
                guard let item = renameTarget else { return }
                Task { await rename(item) }
            }
            Button(L10n.cancel, role: .cancel) {}
        }
        .confirmationDialog(
            L10n.chatDeleteTitle,
            isPresented: .init(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
            titleVisibility: .visible,
            presenting: deleting
        ) { item in
            Button(L10n.delete, role: .destructive) {
                Task { await delete(item) }
            }
        } message: { _ in
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

    @ViewBuilder
    private var content: some View {
        if !store.hasLoadedList {
            LoadingView()
        } else if store.conversations.isEmpty, let notice = store.listNotice {
            ChatLoadFailedView(notice: notice) {
                Task { await load() }
            }
        } else if store.conversations.isEmpty {
            emptyList
        } else {
            list
        }
    }

    private var emptyList: some View {
        ContentUnavailableView {
            Label(L10n.chatEmptyListTitle, systemImage: ChatSymbols.chat)
        } description: {
            Text(L10n.chatEmptyListMessage)
        } actions: {
            Button(L10n.chatStartChat) {
                openChat = store.startNewChat()
            }
            .buttonStyle(.borderedProminent)
        }
    }

    private var list: some View {
        List {
            if let unavailable = store.unavailableNotice {
                Section {
                    ChatUnavailableBanner(notice: unavailable)
                }
            }
            Section {
                ForEach(store.conversations) { item in
                    row(item)
                }
            }
        }
        .refreshable {
            await store.loadConversations()
        }
    }

    private func row(_ item: ChatConversationListItem) -> some View {
        Button {
            openChat = ChatRoute(id: item.id, isNew: false)
        } label: {
            ChatConversationRow(item: item)
        }
        .buttonStyle(.plain)
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) {
                deleting = item
            } label: {
                Label(L10n.delete, systemImage: "trash")
            }
            Button {
                beginRename(item)
            } label: {
                Label(L10n.chatRename, systemImage: "pencil")
            }
            .tint(.blue)
        }
        .contextMenu {
            Button {
                beginRename(item)
            } label: {
                Label(L10n.chatRename, systemImage: "pencil")
            }
            Button(role: .destructive) {
                deleting = item
            } label: {
                Label(L10n.delete, systemImage: "trash")
            }
        }
    }

    private func load() async {
        await store.loadConversations()
        if !didOpenFirstChat, store.hasLoadedList, store.listNotice == nil, store.conversations.isEmpty,
           openChat == nil
        {
            didOpenFirstChat = true
            openChat = store.startNewChat()
        }
        await refreshCapability()
    }

    /// The chat half of the capability comes with the preferences read.
    private func refreshCapability() async {
        do {
            try await preferencesRepository.refresh()
        } catch {
            ErrorReporter.addBreadcrumb("Chat capability refresh failed", category: "chat", data: [
                "reason": ErrorReporter.reason(for: error)
            ])
        }
    }

    private func beginRename(_ item: ChatConversationListItem) {
        renameText = item.title ?? ""
        renameTarget = item
        showRename = true
    }

    private func rename(_ item: ChatConversationListItem) async {
        if let notice = await store.renameConversation(id: item.id, title: renameText) {
            errorMessage = notice.message
        }
    }

    private func delete(_ item: ChatConversationListItem) async {
        if let notice = await store.deleteConversation(id: item.id) {
            errorMessage = notice.message
        }
    }
}

private struct ChatConversationRow: View {
    let item: ChatConversationListItem

    private var isWorking: Bool {
        item.activeRun?.isActive == true
    }

    private var isWaiting: Bool {
        item.activeRun?.status == ChatRunStatus.awaitingConfirmation
    }

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(item.title ?? L10n.chatNewChat)
                    .font(.body)
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                subtitle
            }
            Spacer(minLength: 0)
            if isWorking, !isWaiting {
                ProgressView()
                    .controlSize(.small)
            } else if isWaiting {
                Image(systemName: "hand.raised.fill")
                    .foregroundStyle(.orange)
                    .accessibilityHidden(true)
            }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var subtitle: some View {
        if isWaiting {
            Text(L10n.chatWaitingForYou)
                .font(.caption)
                .foregroundStyle(.orange)
        } else if isWorking {
            Text(L10n.chatWorking)
                .font(.caption)
                .foregroundStyle(.secondary)
        } else if let when = ChatFormatting.relative(item.lastMessageAt ?? item.updatedAt) {
            Text(when)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}
