import SwiftUI

enum ChatSymbols {
    static let chat = "bubble.left.and.text.bubble.right"
    static let newChat = "square.and.pencil"
}

/// A starting point on an empty chat. Questions go out at once; the meal one
/// fills the composer for the user to finish.
struct ChatSuggestion: Identifiable {
    let id: String
    let title: String
    let systemImage: String
    let prompt: String
    let sendsImmediately: Bool

    static var all: [ChatSuggestion] {
        [
            ChatSuggestion(
                id: "today", title: L10n.chatSuggestionToday, systemImage: "target",
                prompt: L10n.chatSuggestionToday, sendsImmediately: true
            ),
            ChatSuggestion(
                id: "remaining", title: L10n.chatSuggestionRemaining, systemImage: "fork.knife",
                prompt: L10n.chatSuggestionRemaining, sendsImmediately: true
            ),
            ChatSuggestion(
                id: "log", title: L10n.chatSuggestionLogMeal, systemImage: "plus.bubble",
                prompt: L10n.chatSuggestionLogMealPrompt, sendsImmediately: false
            ),
            ChatSuggestion(
                id: "weekly", title: L10n.chatSuggestionWeekly, systemImage: "chart.line.uptrend.xyaxis",
                prompt: L10n.chatSuggestionWeekly, sendsImmediately: true
            )
        ]
    }
}

struct ChatEmptyState: View {
    let isEnabled: Bool
    let onSelect: (ChatSuggestion) -> Void

    var body: some View {
        VStack(spacing: 20) {
            VStack(spacing: 8) {
                Image(systemName: ChatSymbols.chat)
                    .font(.largeTitle)
                    .foregroundStyle(.tint)
                    .accessibilityHidden(true)
                Text(L10n.chatEmptyTitle)
                    .font(.title3.weight(.semibold))
                Text(L10n.chatEmptyMessage)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            VStack(spacing: 8) {
                ForEach(ChatSuggestion.all) { suggestion in
                    ChatSuggestionButton(suggestion: suggestion) {
                        onSelect(suggestion)
                    }
                    .disabled(!isEnabled)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
    }
}

private struct ChatSuggestionButton: View {
    let suggestion: ChatSuggestion
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: suggestion.systemImage)
                    .foregroundStyle(.tint)
                    .frame(width: 24)
                    .accessibilityHidden(true)
                Text(suggestion.title)
                    .foregroundStyle(.primary)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .font(.subheadline)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color(.secondarySystemBackground))
            )
            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

/// The first-use notice: what leaves the device and where it goes. Shown
/// until acknowledged; the same text stays reachable from the chat's menu.
struct ChatPrivacyCard: View {
    let onAcknowledge: () -> Void

    @Environment(BissbilanzAPI.self) private var api

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(L10n.chatPrivacyTitle, systemImage: "hand.raised")
                .font(.subheadline.weight(.semibold))
            Text(L10n.chatPrivacyBody)
                .font(.footnote)
                .foregroundStyle(.secondary)
            Text(L10n.chatPrivacyChanges)
                .font(.footnote)
                .foregroundStyle(.secondary)
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 12) { actions }
                VStack(alignment: .leading, spacing: 8) { actions }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color(.secondarySystemBackground))
        )
    }

    @ViewBuilder
    private var actions: some View {
        Button(L10n.chatPrivacyAcknowledge, action: onAcknowledge)
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
        if let url = ChatPrivacyLink.url(baseURL: api.baseURL) {
            Link(L10n.privacyPolicy, destination: url)
                .font(.footnote)
        }
    }
}

enum ChatPrivacyLink {
    static func url(baseURL: String) -> URL? {
        URL(string: "\(baseURL)/privacy")
    }
}

/// The privacy notice again, with this month's remaining budget.
struct ChatAboutSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(BissbilanzAPI.self) private var api
    @Environment(ChatStore.self) private var store

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(L10n.chatPrivacyBody)
                    Text(L10n.chatPrivacyChanges)
                }
                if let remaining = store.capability?.remainingBudgetUsd {
                    Section {
                        Text(L10n.aiTaskProcessorClaudeRemaining(remaining))
                    }
                }
                if let url = ChatPrivacyLink.url(baseURL: api.baseURL) {
                    Section {
                        Link(destination: url) {
                            Label(L10n.privacyPolicy, systemImage: "hand.raised")
                        }
                    }
                }
            }
            .navigationTitle(L10n.chatPrivacyTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.done) { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

/// Why the composer is off, while the conversations stay readable.
struct ChatUnavailableBanner: View {
    let notice: ChatNotice

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: "exclamationmark.circle")
                .foregroundStyle(.orange)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(notice.message)
                    .font(.footnote.weight(.medium))
                Text(L10n.chatComposerDisabled)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }
}

/// A run's end or a request's failure, with "New chat" when the chat is full.
struct ChatNoticeRow: View {
    let notice: ChatNotice
    var onNewChat: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(notice.message, systemImage: "info.circle")
                .font(.footnote)
                .foregroundStyle(.secondary)
            if notice.offersNewChat, let onNewChat {
                Button(action: onNewChat) {
                    Label(L10n.chatNewChat, systemImage: ChatSymbols.newChat)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

enum ChatFormatting {
    /// "5 minutes ago" / "vor 5 Minuten", in the app's language.
    static func relative(_ isoTimestamp: String?) -> String? {
        guard let isoTimestamp, let date = DateFormatting.isoDateTime(from: isoTimestamp) else { return nil }
        return date.formatted(
            Date.RelativeFormatStyle(presentation: .named, unitsStyle: .wide)
                .locale(Locale(identifier: L10n.currentLocale.rawValue))
        )
    }
}
