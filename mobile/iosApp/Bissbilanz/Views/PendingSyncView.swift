import SwiftData
import SwiftUI

/// Shows the offline sync queue — every local change still waiting to upload —
/// with its kind, age and retry status, plus a manual retry. Reached from the
/// "N changes waiting to sync" row in Settings.
///
/// Reads the queue with `@Query` (the same `mainContext` the `SyncManager`
/// writes to), so it updates live as ops drain or new ones are enqueued.
struct PendingSyncView: View {
    @Environment(SyncManager.self) private var syncManager
    @Query(sort: \PendingSyncOperation.seq) private var pending: [PendingSyncOperation]

    var body: some View {
        List {
            if pending.isEmpty {
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
                Section {
                    ForEach(pending) { row in
                        PendingSyncRow(row: row)
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
    }
}

private struct PendingSyncRow: View {
    let row: PendingSyncOperation

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: Self.icon(for: row.type))
                .foregroundStyle(.secondary)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(L10n.pendingChangeTitle(forType: row.type))
                    .font(.subheadline)
                Text(row.createdAt, format: .relative(presentation: .named))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            statusLabel
        }
    }

    @ViewBuilder
    private var statusLabel: some View {
        if row.retryCount > 0 {
            Text(L10n.syncRetryStatus(row.retryCount, SyncManager.maxRetries))
                .font(.caption2)
                .foregroundStyle(.orange)
        } else {
            Text(L10n.syncWaiting)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    /// SF Symbol per queued op kind (matches the entity, not the action).
    static func icon(for type: String) -> String {
        switch type {
        case "create_food", "update_food", "delete_food", "toggle_favorite": "fork.knife"
        case "create_entry", "update_entry", "delete_entry": "plus.circle"
        case "create_recipe", "update_recipe", "delete_recipe": "book"
        case "set_goals": "target"
        case "create_weight", "update_weight", "delete_weight": "scalemass"
        case "create_sleep", "update_sleep", "delete_sleep": "bed.double"
        case "create_supplement", "update_supplement", "delete_supplement",
             "log_supplement", "unlog_supplement": "pills"
        case "set_day_properties", "delete_day_properties": "calendar"
        case "upsert_fast", "delete_fast": "timer"
        case "update_preferences": "gearshape"
        default: "arrow.triangle.2.circlepath"
        }
    }
}
