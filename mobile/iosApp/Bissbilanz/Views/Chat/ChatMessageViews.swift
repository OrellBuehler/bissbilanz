import SwiftUI

/// One message of the transcript: the user's on the right in a tinted bubble,
/// the assistant's full width, its parts top to bottom.
struct ChatMessageView: View {
    let message: ChatMessage
    /// The answer that is still streaming: its text is parsed on every delta,
    /// the others come from the cache.
    var isStreaming = false
    var onNewChat: () -> Void

    var body: some View {
        if message.isFromUser {
            ChatUserMessage(message: message)
        } else {
            ChatAssistantMessage(message: message, isStreaming: isStreaming, onNewChat: onNewChat)
        }
    }
}

private struct ChatUserMessage: View {
    let message: ChatMessage
    @State private var galleryIndex: Int?

    private var text: String {
        message.parts.filter { $0.type == ChatMessagePart.textType }.compactMap(\.text).joined(separator: "\n")
    }

    private var imageUrls: [String] {
        message.parts.filter { $0.type == ChatMessagePart.imageType }.compactMap(\.url)
    }

    var body: some View {
        VStack(alignment: .trailing, spacing: 6) {
            if !imageUrls.isEmpty {
                ChatPhotoStrip(count: imageUrls.count) { index in
                    Button {
                        galleryIndex = index
                    } label: {
                        FoodImageView(imageUrl: imageUrls[index])
                            .frame(width: 88, height: 88)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L10n.chatPhoto(index + 1))
                }
            }
            if !text.isEmpty {
                ChatUserBubble(text: text)
            }
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
        .padding(.leading, 48)
        .fullScreenCover(isPresented: Binding(
            get: { galleryIndex != nil },
            set: { if !$0 { galleryIndex = nil } }
        )) {
            AiTaskImageViewer(imageUrls: imageUrls, initialIndex: galleryIndex ?? 0) {
                galleryIndex = nil
            }
        }
    }
}

struct ChatUserBubble: View {
    let text: String

    var body: some View {
        Text(text)
            .textSelection(.enabled)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(Color.accentColor.opacity(0.16))
            )
            .accessibilityLabel(L10n.chatYou + ": " + text)
    }
}

/// Photos in a row, trailing-aligned like the bubble under them.
struct ChatPhotoStrip<Item: View>: View {
    let count: Int
    @ViewBuilder let item: (Int) -> Item

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(0 ..< count, id: \.self) { index in
                    item(index)
                }
            }
        }
        .scrollBounceBehavior(.basedOnSize)
        .defaultScrollAnchor(.trailing)
        .frame(height: 88)
    }
}

private struct ChatAssistantMessage: View {
    let message: ChatMessage
    let isStreaming: Bool
    var onNewChat: () -> Void

    private var notice: ChatNotice? {
        ChatNotice.forMessage(status: message.status, reason: message.reason)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(message.parts.enumerated()), id: \.offset) { index, part in
                ChatPartView(part: part, isStreaming: isStreaming && index == message.parts.count - 1)
            }
            if let notice {
                ChatNoticeRow(notice: notice, onNewChat: onNewChat)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct ChatPartView: View {
    let part: ChatMessagePart
    let isStreaming: Bool

    var body: some View {
        switch part.type {
        case ChatMessagePart.textType:
            ChatMarkdownView(text: part.text ?? "", isStreaming: isStreaming)
                .textSelection(.enabled)
        case ChatMessagePart.toolType:
            ChatToolRow(part: part)
        case ChatMessagePart.actionType:
            ChatActionCard(part: part)
        case ChatMessagePart.imageType:
            if let url = part.url {
                FoodImageView(imageUrl: url)
                    .frame(width: 120, height: 120)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        default:
            EmptyView()
        }
    }
}

/// A tool call as a quiet status line, with the server's label ("Logging
/// food") and, for a failed call, its message.
struct ChatToolRow: View {
    let part: ChatMessagePart

    private enum Phase {
        case running
        case done
        case failed
    }

    private var phase: Phase {
        switch part.status {
        case "running"?: .running
        case "error"?: .failed
        default: .done
        }
    }

    private var label: String {
        part.label ?? part.name ?? ""
    }

    private var phaseLabel: String {
        switch phase {
        case .running: L10n.chatToolRunning
        case .done: L10n.chatToolDone
        case .failed: L10n.chatToolFailed
        }
    }

    private var doneSymbol: String {
        switch part.name {
        case "web_search"?, "web_fetch"?: "globe"
        default: "checkmark.circle"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 8) {
                icon
                    .frame(width: 16, height: 16)
                Text(label)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            if phase == .failed, let summary = part.summary, !summary.isEmpty {
                Text(summary)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.leading, 24)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label + ", " + phaseLabel)
        .accessibilityValue(part.summary ?? "")
    }

    @ViewBuilder
    private var icon: some View {
        switch phase {
        case .running:
            ProgressView()
                .controlSize(.mini)
        case .done:
            Image(systemName: doneSymbol)
                .font(.footnote)
                .foregroundStyle(.secondary)
        case .failed:
            Image(systemName: "exclamationmark.triangle")
                .font(.footnote)
                .foregroundStyle(.orange)
        }
    }
}

/// A message not yet taken by the server: sending, or failed with a retry
/// that reuses the same message id.
struct ChatPendingMessageView: View {
    let message: ChatPendingMessage
    let onRetry: () -> Void
    let onDiscard: () -> Void
    let onEdit: () -> Void
    let onNewChat: () -> Void

    var body: some View {
        VStack(alignment: .trailing, spacing: 6) {
            if !message.images.isEmpty {
                ChatPhotoStrip(count: message.images.count) { index in
                    Image(uiImage: message.images[index])
                        .resizable()
                        .scaledToFill()
                        .frame(width: 88, height: 88)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .accessibilityLabel(L10n.chatPhoto(index + 1))
                }
            }
            ChatUserBubble(text: message.text)
                .opacity(isSending ? 0.6 : 1)
            status
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
        .padding(.leading, 48)
    }

    private var isSending: Bool {
        message.state == .sending
    }

    @ViewBuilder
    private var status: some View {
        switch message.state {
        case .sending:
            HStack(spacing: 6) {
                ProgressView()
                    .controlSize(.mini)
                Text(L10n.chatSending)
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            .accessibilityElement(children: .combine)
        case let .failed(notice):
            ChatPendingFailure(
                notice: notice, onRetry: onRetry, onDiscard: onDiscard, onEdit: onEdit, onNewChat: onNewChat
            )
        }
    }
}

private struct ChatPendingFailure: View {
    let notice: ChatNotice
    let onRetry: () -> Void
    let onDiscard: () -> Void
    let onEdit: () -> Void
    let onNewChat: () -> Void

    var body: some View {
        VStack(alignment: .trailing, spacing: 6) {
            Label(L10n.chatNotSent + ": " + notice.message, systemImage: "exclamationmark.circle")
                .font(.caption)
                .foregroundStyle(.orange)
                .multilineTextAlignment(.trailing)
            HStack(spacing: 8) {
                if notice.returnsToComposer {
                    Button(action: onEdit) {
                        Label(L10n.edit, systemImage: "pencil")
                    }
                } else {
                    Button(L10n.delete, role: .destructive, action: onDiscard)
                    if notice.offersNewChat {
                        Button(action: onNewChat) {
                            Label(L10n.chatNewChat, systemImage: ChatSymbols.newChat)
                        }
                    } else {
                        Button(L10n.retry, action: onRetry)
                    }
                }
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .lineLimit(1)
        }
    }
}

/// "Thinking…" while the run works on something the transcript does not show
/// yet: before the first part, and between a finished tool call and the next.
struct ChatThinkingRow: View {
    let text: String

    var body: some View {
        HStack(spacing: 8) {
            ProgressView()
                .controlSize(.small)
            Text(text)
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}
