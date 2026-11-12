import SwiftUI

/// The conversation under the summary of a task Claude processed on the
/// server and, while one is possible, the box to reply to it. Only a task that
/// carries a `claudeThread` gets one; every other task looks as it always did.
struct AiTaskThreadView: View {
    @Environment(AiTaskStore.self) private var store

    let task: AiTask
    let thread: AiTaskClaudeThread

    @State private var text = ""
    @State private var sendError: String?
    /// Closed until the user asks to reply, so a list of finished meals is not
    /// a column of empty text fields.
    @State private var isComposing = false
    @State private var focusOnAppear = false
    @FocusState private var isFocused: Bool

    private var isSending: Bool {
        store.sendingReplies.contains(task.id)
    }

    private var canSend: Bool {
        !isSending && !AiTaskReplyDraft.trimmed(text).isEmpty
    }

    private var hint: String {
        let remaining = thread.repliesRemaining
        guard (1 ... 2).contains(remaining) else { return L10n.aiTasksReplyHint }
        return "\(L10n.aiTasksReplyHint) \(L10n.aiTasksRepliesRemaining(remaining))"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(thread.messages) { message in
                AiTaskThreadMessageRow(message: message)
            }
            footer
        }
    }

    /// A correction in flight wins over the reply box: the server takes no
    /// reply until it ends, and the user should see that it is happening.
    @ViewBuilder
    private var footer: some View {
        let correction = thread.correction
        if correction.isInFlight {
            working(correction)
        } else if thread.canReply {
            if isComposing || !text.isEmpty || sendError != nil {
                composer
            } else {
                Button {
                    focusOnAppear = true
                    isComposing = true
                } label: {
                    Label(L10n.aiTasksReplyLabel, systemImage: "arrowshape.turn.up.left")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
        } else if let reason = thread.blockedReason {
            Label(L10n.aiTasksReplyBlocked(reason), systemImage: "info.circle")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    private func working(_ correction: AiTaskCorrectionState) -> some View {
        HStack(spacing: 8) {
            ProgressView()
                .controlSize(.small)
            Text(correction == .retrying ? L10n.aiTasksClaudeState(.retrying) : L10n.aiTasksReplyWorking)
                .font(.footnote)
        }
        .foregroundStyle(.blue)
        .accessibilityElement(children: .combine)
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 6) {
            TextField(L10n.aiTasksReplyPlaceholder, text: $text, axis: .vertical)
                .font(.footnote)
                .lineLimit(2 ... 6)
                .focused($isFocused)
                .disabled(isSending)
                .padding(8)
                .background(Color.secondary.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .accessibilityLabel(L10n.aiTasksReplyLabel)
                .onAppear {
                    guard focusOnAppear else { return }
                    focusOnAppear = false
                    isFocused = true
                }
                .onChange(of: text) { _, newValue in
                    let clamped = AiTaskReplyDraft.clamped(newValue)
                    if clamped != newValue {
                        text = clamped
                    }
                    sendError = nil
                }
                .onChange(of: isFocused) { _, focused in
                    // Left empty, the box folds back into the Reply button.
                    if !focused, AiTaskReplyDraft.trimmed(text).isEmpty, !isSending {
                        isComposing = false
                    }
                }
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(hint)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer(minLength: 0)
                if !text.isEmpty {
                    Text(verbatim: "\(AiTaskReplyDraft.length(text))/\(AiTaskReplyDraft.maxLength)")
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }
            if let sendError {
                Text(sendError)
                    .font(.footnote)
                    .foregroundStyle(.red)
            }
            Button {
                Task { await send() }
            } label: {
                HStack(spacing: 6) {
                    if isSending {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Image(systemName: "paperplane.fill")
                            .accessibilityHidden(true)
                    }
                    Text(L10n.aiTasksReplySend)
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(!canSend)
        }
    }

    /// The typed text stays when the send fails, so the user can fix or resend it.
    private func send() async {
        sendError = nil
        switch await store.sendReply(taskId: task.id, text: text) {
        case .sent:
            text = ""
            isFocused = false
            isComposing = false
        case let .failed(failure):
            sendError = L10n.aiTasksReplyFailure(failure)
        case .skipped:
            break
        }
    }
}

/// One message: the user's own sit muted and indented from the left, Claude's
/// are tinted and say what they did to the meal.
private struct AiTaskThreadMessageRow: View {
    let message: AiTaskThreadMessage

    private var tint: Color {
        message.replyOutcome == .failed ? .orange : .purple
    }

    var body: some View {
        if message.isFromUser {
            userBubble
        } else {
            answerBubble
        }
    }

    private var userBubble: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(L10n.aiTasksReplyYou)
                .font(.caption2.weight(.medium))
                .foregroundStyle(.secondary)
            Text(message.text)
                .font(.footnote)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color.secondary.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .padding(.leading, 24)
        .accessibilityElement(children: .combine)
    }

    private var answerBubble: some View {
        VStack(alignment: .leading, spacing: 4) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 6) { badges }
                VStack(alignment: .leading, spacing: 4) { badges }
            }
            Text(message.text)
                .font(.footnote)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(tint.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .strokeBorder(tint.opacity(0.3), lineWidth: 1)
        }
        .padding(.trailing, 24)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var badges: some View {
        Label(L10n.aiTasksReplyClaude, systemImage: "sparkles")
            .font(.caption2.weight(.medium))
            .foregroundStyle(.purple)
        switch message.replyOutcome {
        case .changed:
            ReplyOutcomeChip(text: L10n.aiTasksReplyChanged, systemImage: "checkmark.circle.fill", tint: .green)
        case .failed:
            ReplyOutcomeChip(text: L10n.aiTasksReplyFailed, systemImage: "exclamationmark.triangle.fill", tint: .orange)
        case .answered:
            EmptyView()
        }
        if message.unread {
            UnreadChip()
        }
    }
}

private struct ReplyOutcomeChip: View {
    let text: String
    let systemImage: String
    let tint: Color

    var body: some View {
        Label(text, systemImage: systemImage)
            .font(.caption2.weight(.semibold))
            .lineLimit(1)
            .foregroundStyle(tint)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(tint.opacity(0.12))
            .clipShape(Capsule())
    }
}

/// The "New" capsule on an unread dismissal, a task with an unread answer, and the answer itself.
struct UnreadChip: View {
    var body: some View {
        Text(L10n.aiTasksUnread)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Color.accentColor.opacity(0.15))
            .clipShape(Capsule())
    }
}
