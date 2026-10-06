import SwiftData
import SwiftUI

/// Identifies the queue row a sheet or dialog is about. Carries the row's `id`
/// rather than the model object: a discarded row is deleted from the store, and
/// reading a deleted SwiftData model while its sheet animates out would crash.
struct PendingSyncSelection: Identifiable {
    let id: UUID
}

extension PendingChangeLookup {
    /// Backs the lookup with the local store, so ids resolve to the names and
    /// cached records the user sees elsewhere in the app.
    @MainActor
    static func store(context: ModelContext, queued: [PendingSyncOperation]) -> PendingChangeLookup {
        let creates = queued
            .filter { $0.type == "create_food" || $0.type == "create_recipe" }
            .compactMap { $0.operation() }
        return PendingChangeLookup(
            food: { id in
                var descriptor = FetchDescriptor<LocalFood>(predicate: #Predicate { $0.id == id })
                descriptor.fetchLimit = 1
                return (try? context.fetch(descriptor))?.first?.toFood()
            },
            recipe: { id in
                var descriptor = FetchDescriptor<LocalRecipe>(predicate: #Predicate { $0.id == id })
                descriptor.fetchLimit = 1
                return (try? context.fetch(descriptor))?.first?.toRecipe()
            },
            entry: { id in
                var descriptor = FetchDescriptor<LocalEntry>(predicate: #Predicate { $0.id == id })
                descriptor.fetchLimit = 1
                return (try? context.fetch(descriptor))?.first?.toEntry()
            },
            resolveId: { TempIdMap.resolved($0) },
            queuedNames: PendingChangeLookup.names(of: creates)
        )
    }
}

/// Full details of one queued change: what it is about, where it stands, the
/// values it carries (or which fields it changes) and retry / discard actions.
struct PendingChangeSheet: View {
    let rowId: UUID

    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @Environment(SyncManager.self) private var syncManager
    @Query(sort: \PendingSyncOperation.seq) private var queued: [PendingSyncOperation]
    @State private var confirmingDiscard = false

    private var row: PendingSyncOperation? {
        queued.first { $0.id == rowId }
    }

    var body: some View {
        NavigationStack {
            Group {
                if let row {
                    content(for: row)
                } else {
                    Color.clear
                }
            }
            .navigationTitle(L10n.pendingDetailsTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.done) { dismiss() }
                }
            }
            .onChange(of: row == nil) { _, gone in
                if gone { dismiss() }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    @ViewBuilder
    private func content(for row: PendingSyncOperation) -> some View {
        let lookup = PendingChangeLookup.store(context: modelContext, queued: queued)
        let details = PendingChangeDescriber.details(
            type: row.type, operation: row.operation(), lookup: lookup,
            before: PendingChangeSnapshots.lookup(rowId: row.id)
        )
        let parked = row.failedAt != nil
        List {
            Section {
                header(details.summary, type: row.type, parked: parked)
            }
            Section {
                statusRows(for: row, parked: parked)
            }
            ForEach(details.sections) { section in
                Section {
                    ForEach(Array(section.fields.enumerated()), id: \.offset) { _, field in
                        PendingChangeFieldRow(field: field)
                    }
                } header: {
                    if let title = section.title { Text(title) }
                }
            }
            if !details.notes.isEmpty {
                Section {
                    ForEach(details.notes, id: \.self) { note in
                        Text(note)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            Section {
                Button {
                    if parked {
                        syncManager.retryParked(row)
                    } else {
                        syncManager.retryNow()
                    }
                    dismiss()
                } label: {
                    Label(parked ? L10n.retry : L10n.retryNow, systemImage: "arrow.clockwise")
                }
                .disabled(!parked && syncManager.isSyncing)
                if parked {
                    Button(role: .destructive) {
                        confirmingDiscard = true
                    } label: {
                        Label(L10n.discard, systemImage: "trash")
                    }
                }
            }
        }
        .confirmationDialog(
            L10n.pendingDiscardTitle,
            isPresented: $confirmingDiscard,
            titleVisibility: .visible
        ) {
            Button(L10n.discard, role: .destructive) {
                dismiss()
                syncManager.discardParked(row)
            }
            Button(L10n.cancel, role: .cancel) {}
        } message: {
            Text(details.discardMessage(dependents: syncManager.dependentCount(of: row)))
        }
    }

    private func header(_ summary: PendingChangeSummary, type: String, parked: Bool) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: PendingChangeDescriber.icon(forType: type))
                .font(.title3)
                .foregroundStyle(parked ? Color.red : Color.accentColor)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(summary.primary)
                    .font(.headline)
                if let secondary = summary.secondary {
                    Text(secondary)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func statusRows(for row: PendingSyncOperation, parked: Bool) -> some View {
        LabeledContent(L10n.pendingDetailStatus) {
            Text(statusText(for: row, parked: parked))
                .foregroundStyle(parked ? Color.red : Color.secondary)
        }
        LabeledContent(L10n.pendingDetailCreated) {
            Text(row.createdAt.formatted(date: .abbreviated, time: .shortened))
        }
        if let edited = DateFormatting.isoDateTime(from: row.clientEditedAt),
           abs(edited.timeIntervalSince(row.createdAt)) > 1
        {
            LabeledContent(L10n.pendingDetailEdited) {
                Text(edited.formatted(date: .abbreviated, time: .shortened))
            }
        }
        if row.retryCount > 0 {
            LabeledContent(L10n.pendingDetailRetries) {
                Text("\(row.retryCount)")
            }
        }
        if let failedAt = row.failedAt {
            LabeledContent(L10n.pendingDetailRejectedOn) {
                Text(failedAt.formatted(date: .abbreviated, time: .shortened))
            }
        } else if row.nextAttemptAt > Date() {
            LabeledContent(L10n.pendingDetailNextAttempt) {
                Text(row.nextAttemptAt.formatted(date: .abbreviated, time: .shortened))
            }
        }
        if let reason = row.failureReason {
            VStack(alignment: .leading, spacing: 4) {
                Text(L10n.pendingDetailReason)
                Text(reason)
                    .font(.subheadline)
                    .foregroundStyle(.red)
            }
        }
    }

    private func statusText(for row: PendingSyncOperation, parked: Bool) -> String {
        if parked { return L10n.pendingDetailRejected }
        return row.retryCount > 0 ? L10n.pendingDetailRetrying : L10n.syncWaiting
    }
}

/// One label/value row; shows old → new when the value was compared to a record.
private struct PendingChangeFieldRow: View {
    let field: PendingChangeField

    var body: some View {
        if let oldValue = field.oldValue, oldValue != field.value {
            VStack(alignment: .leading, spacing: 4) {
                Text(field.label)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(oldValue)
                        .strikethrough()
                        .foregroundStyle(.secondary)
                    Image(systemName: "arrow.right")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .accessibilityHidden(true)
                    Text(field.value)
                }
                .font(.subheadline)
            }
            .accessibilityElement(children: .combine)
        } else if field.value.contains("\n") {
            VStack(alignment: .leading, spacing: 4) {
                Text(field.label)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Text(field.value)
                    .font(.subheadline)
            }
            .accessibilityElement(children: .combine)
        } else {
            LabeledContent(field.label) {
                Text(field.value)
                    .multilineTextAlignment(.trailing)
            }
        }
    }
}
