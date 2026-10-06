import SwiftData
import SwiftUI

/// Shows the offline sync queue — every local change still waiting to upload —
/// with what each one is about, its retry status, plus a manual retry. Tapping
/// a row opens its full details. Reached from the "N changes waiting to sync"
/// row in Settings.
///
/// Reads the queue with `@Query` (the same `mainContext` the `SyncManager`
/// writes to), so it updates live as ops drain or new ones are enqueued.
struct PendingSyncView: View {
    @Environment(SyncManager.self) private var syncManager
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \PendingSyncOperation.seq) private var queued: [PendingSyncOperation]
    @State private var selected: PendingSyncSelection?
    @State private var discardTarget: PendingSyncSelection?

    private var pending: [PendingSyncOperation] {
        queued.filter { $0.failedAt == nil }
    }

    private var parked: [PendingSyncOperation] {
        queued.filter { $0.failedAt != nil }
    }

    var body: some View {
        let lookup = PendingChangeLookup.store(context: modelContext, queued: queued)
        List {
            if queued.isEmpty {
                ContentUnavailableView {
                    Label(L10n.pendingChangesEmpty, systemImage: "checkmark.circle")
                } description: {
                    Text(L10n.pendingChangesEmptyDetail)
                }
            } else {
                if let syncError = syncManager.errors.last {
                    Section {
                        HStack(alignment: .firstTextBaseline) {
                            Image(systemName: "exclamationmark.triangle")
                                .foregroundStyle(.red)
                            Text(syncError)
                                .font(.caption)
                                .foregroundStyle(.red)
                        }
                    }
                }
                if !parked.isEmpty {
                    Section {
                        ForEach(parked) { row in
                            PendingSyncRow(row: row, lookup: lookup) {
                                selected = PendingSyncSelection(id: row.id)
                            }
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) {
                                    discardTarget = PendingSyncSelection(id: row.id)
                                } label: {
                                    Label(L10n.discard, systemImage: "trash")
                                }
                                Button {
                                    syncManager.retryParked(row)
                                } label: {
                                    Label(L10n.retry, systemImage: "arrow.clockwise")
                                }
                                .tint(.blue)
                            }
                        }
                    } header: {
                        Text(L10n.pendingChangesParkedTitle)
                    } footer: {
                        Text(L10n.pendingChangesParkedDetail)
                    }
                }
                if !pending.isEmpty {
                    Section {
                        ForEach(pending) { row in
                            PendingSyncRow(row: row, lookup: lookup) {
                                selected = PendingSyncSelection(id: row.id)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle(L10n.pendingChanges)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if !pending.isEmpty {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        syncManager.retryNow()
                    } label: {
                        Label(L10n.retryNow, systemImage: "arrow.clockwise")
                    }
                    .disabled(syncManager.isSyncing)
                }
            }
        }
        .sheet(item: $selected) { selection in
            PendingChangeSheet(rowId: selection.id)
        }
        .confirmationDialog(
            L10n.pendingDiscardTitle,
            isPresented: Binding(
                get: { discardTarget != nil },
                set: { if !$0 { discardTarget = nil } }
            ),
            titleVisibility: .visible,
            presenting: discardTarget
        ) { target in
            Button(L10n.discard, role: .destructive) {
                if let row = queued.first(where: { $0.id == target.id }) {
                    syncManager.discardParked(row)
                }
            }
            Button(L10n.cancel, role: .cancel) {}
        } message: { target in
            Text(discardMessage(for: target, lookup: lookup))
        }
    }

    private func discardMessage(for target: PendingSyncSelection, lookup: PendingChangeLookup) -> String {
        guard let row = queued.first(where: { $0.id == target.id }) else { return "" }
        return PendingChangeDescriber.details(type: row.type, operation: row.operation(), lookup: lookup)
            .discardMessage
    }
}

/// One queued change: what it is about on the first line, its operation and
/// key values on the second. A change the server permanently rejected is kept
/// in the store (never deleted by the drain) with the reason, and the user
/// decides whether to retry or discard it from its details.
private struct PendingSyncRow: View {
    let row: PendingSyncOperation
    let lookup: PendingChangeLookup
    let onSelect: () -> Void

    private var isParked: Bool {
        row.failedAt != nil
    }

    var body: some View {
        let summary = PendingChangeDescriber.summary(type: row.type, operation: row.operation(), lookup: lookup)
        Button(action: onSelect) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: PendingChangeDescriber.icon(forType: row.type))
                    .foregroundStyle(isParked ? Color.red : Color.secondary)
                    .frame(width: 24)
                    .padding(.top, 2)
                VStack(alignment: .leading, spacing: 2) {
                    Text(summary.primary)
                        .font(.subheadline)
                        .lineLimit(2)
                    if let secondary = summary.secondary {
                        Text(secondary)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                    if isParked {
                        if let reason = row.failureReason {
                            Text(L10n.syncParkedReason(reason))
                                .font(.caption)
                                .foregroundStyle(.red)
                                .lineLimit(2)
                        }
                    } else {
                        Text(row.createdAt, format: .relative(presentation: .named))
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                }
                Spacer(minLength: 8)
                if !isParked {
                    statusLabel
                }
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
                    .padding(.top, 4)
                    .accessibilityHidden(true)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var statusLabel: some View {
        if row.retryCount > 0 {
            Text(L10n.syncRetryStatus(row.retryCount))
                .font(.caption2)
                .foregroundStyle(.orange)
        } else {
            Text(L10n.syncWaiting)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }
}
