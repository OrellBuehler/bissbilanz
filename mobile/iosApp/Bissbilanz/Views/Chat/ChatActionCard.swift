import SwiftUI

/// A call that waits for the user: the server's preview (one summary line and
/// every field the call sets), Approve and Reject while it is open, and its
/// outcome once decided. An open card past `expiresAt` shows as expired; the
/// server ends the run on its own.
struct ChatActionCard: View {
    let part: ChatMessagePart

    @Environment(ChatStore.self) private var store
    @State private var now = Date()

    private var actionId: String? {
        part.actionId
    }

    private var expiresAt: Date? {
        part.expiresAt.flatMap(DateFormatting.isoDateTime(from:))
    }

    private var isServerPending: Bool {
        part.status == ChatActionStatus.pending
    }

    private var hasExpired: Bool {
        guard let expiresAt else { return false }
        return expiresAt <= now
    }

    private var isOpen: Bool {
        isServerPending && !hasExpired
    }

    private var isDeciding: Bool {
        actionId.map { store.actionsInFlight.contains($0) } ?? false
    }

    private var notice: ChatNotice? {
        actionId.flatMap { store.actionNotices[$0] }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            ChatActionPreviewText(preview: part.preview)
            if isOpen {
                buttons
                if let expiresAt {
                    Text(L10n.chatActionExpires(DateFormatting.timeString(from: expiresAt)))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } else {
                ChatActionOutcome(status: isServerPending ? ChatActionStatus.expired : part.status)
            }
            if let notice {
                Text(notice.message)
                    .font(.footnote)
                    .foregroundStyle(.orange)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color(.secondarySystemBackground))
        )
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(isOpen ? Color.orange.opacity(0.45) : Color.secondary.opacity(0.15), lineWidth: 1)
        }
        .accessibilityElement(children: .contain)
        .task(id: part.expiresAt) {
            guard isServerPending, let expiresAt else { return }
            let wait = expiresAt.timeIntervalSinceNow
            if wait > 0 {
                // Only throws on cancellation (the card went away), checked below.
                try? await Task.sleep(for: .seconds(wait))
                if Task.isCancelled { return }
            }
            now = Date()
        }
    }

    private var header: some View {
        Label(part.label ?? L10n.chatActionNeedsConfirmation, systemImage: "hand.raised")
            .font(.caption.weight(.semibold))
            .foregroundStyle(isOpen ? Color.orange : Color.secondary)
    }

    private var buttons: some View {
        HStack(spacing: 10) {
            Button {
                decide(approve: false)
            } label: {
                Text(L10n.chatReject)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)

            Button {
                decide(approve: true)
            } label: {
                ZStack {
                    Text(L10n.chatApprove)
                        .lineLimit(1)
                        .opacity(isDeciding ? 0 : 1)
                    if isDeciding {
                        ProgressView()
                            .controlSize(.small)
                    }
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
        }
        .disabled(isDeciding || actionId == nil)
    }

    private func decide(approve: Bool) {
        guard let actionId else { return }
        Task { await store.decide(actionId: actionId, approve: approve) }
    }
}

/// The summary and every detail line, none shortened. A preview can hold up
/// to 200 lines, some of them long, so a long one scrolls inside the card and
/// Approve and Reject stay close.
private struct ChatActionPreviewText: View {
    let preview: ChatActionPreview?

    private var details: [String] {
        preview?.details ?? []
    }

    private var isLong: Bool {
        details.count > 12 || details.reduce(0) { $0 + $1.count } > 1200
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let summary = preview?.summary, !summary.isEmpty {
                Text(summary)
                    .font(.subheadline.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
            }
            if isLong {
                ScrollView {
                    detailLines
                }
                .frame(height: 280)
                .scrollIndicators(.visible)
            } else {
                detailLines
            }
        }
    }

    private var detailLines: some View {
        LazyVStack(alignment: .leading, spacing: 4) {
            ForEach(Array(details.enumerated()), id: \.offset) { _, line in
                Text(line)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

private struct ChatActionOutcome: View {
    let status: String?

    private var label: String {
        switch status ?? "" {
        case ChatActionStatus.approved: L10n.chatActionApproved
        case ChatActionStatus.rejected: L10n.chatActionRejected
        case ChatActionStatus.expired: L10n.chatActionExpired
        case ChatActionStatus.cancelled: L10n.chatActionCancelled
        default: L10n.chatActionResolved
        }
    }

    private var symbol: String {
        switch status ?? "" {
        case ChatActionStatus.approved: "checkmark.circle.fill"
        case ChatActionStatus.rejected: "xmark.circle"
        default: "clock.badge.xmark"
        }
    }

    var body: some View {
        Label(label, systemImage: symbol)
            .font(.caption.weight(.medium))
            .foregroundStyle(status == ChatActionStatus.approved ? Color.green : Color.secondary)
    }
}
