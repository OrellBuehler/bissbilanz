import SwiftUI

struct AiTasksView: View {
    @Environment(AiTaskStore.self) private var store
    @Environment(\.scenePhase) private var scenePhase

    @State private var isLoading = true
    @State private var error: Error?
    @State private var selectedFilter: Filter = .open
    @State private var hasChosenFilter = false
    @State private var errorMessage: String?
    @State private var proposalNotice: String?
    /// `AiTaskProcessor` review-first results waiting for the user to confirm
    /// them — reloaded from disk alongside every `store.refresh()`, which by
    /// the time it returns has already given the processor a chance to run
    /// (see `AiTaskStore.onRefreshed`).
    @State private var readyForReviewDrafts: [ProcessedAiTaskDraft] = []
    @State private var selectedDraftForReview: ProcessedAiTaskDraft?
    @State private var editingTask: AiTask?

    private enum Filter: Int, CaseIterable, Identifiable {
        case open
        case completed
        case dismissed

        var id: Int { rawValue }

        var label: String {
            switch self {
            case .open: L10n.aiTasksFilterOpen
            case .completed: L10n.aiTasksFilterCompleted
            case .dismissed: L10n.aiTasksFilterDismissed
            }
        }

        var emptyMessage: String {
            switch self {
            case .open: L10n.aiTasksEmptyOpen
            case .completed: L10n.aiTasksEmptyCompleted
            case .dismissed: L10n.aiTasksEmptyDismissed
            }
        }

        var status: String {
            switch self {
            case .open: "pending"
            case .completed: "completed"
            case .dismissed: "dismissed"
            }
        }
    }

    private var shouldPoll: Bool {
        store.hasActiveClaudeWork && scenePhase == .active
    }

    private static let pollInterval = Duration.seconds(10)

    private var visibleTasks: [AiTask] {
        store.tasks.filter { $0.status == selectedFilter.status }
    }

    private var visibleUploads: [PendingAiTaskUpload] {
        selectedFilter == .open ? store.pendingUploads : []
    }

    /// Only a draft whose task is still `pending` server-side — a stale draft
    /// left behind after the task was resolved elsewhere (another device, or
    /// the MCP assistant, before the user routed tasks to this iPhone) has no
    /// task left to confirm.
    private var visibleDrafts: [ProcessedAiTaskDraft] {
        guard selectedFilter == .open else { return [] }
        let pendingTaskIds = Set(store.tasks.filter { $0.status == "pending" }.map(\.id))
        return readyForReviewDrafts.filter { pendingTaskIds.contains($0.taskId) }
    }

    var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: $selectedFilter) {
                ForEach(Filter.allCases) { option in
                    Text(option.label).tag(option)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.top, 8)
            .onChange(of: selectedFilter) { _, _ in hasChosenFilter = true }

            Group {
                if isLoading {
                    LoadingView()
                } else if let error {
                    ErrorView(error: error) { Task { await load() } }
                } else if visibleTasks.isEmpty, visibleUploads.isEmpty, visibleDrafts.isEmpty {
                    ContentUnavailableView(
                        L10n.aiTasks,
                        systemImage: "sparkles",
                        description: Text(selectedFilter.emptyMessage)
                    )
                } else {
                    List {
                        ForEach(visibleDrafts) { draft in
                            Button {
                                selectedDraftForReview = draft
                            } label: {
                                ReadyForReviewRow(draft: draft)
                            }
                            .buttonStyle(.plain)
                        }
                        ForEach(visibleUploads) { upload in
                            PendingUploadRow(upload: upload)
                                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                    Button(role: .destructive) {
                                        store.discardUpload(id: upload.id)
                                    } label: {
                                        Label(L10n.discard, systemImage: "trash")
                                    }
                                }
                        }
                        ForEach(visibleTasks) { task in
                            AiTaskRow(
                                task: task,
                                claudeState: AiTaskClaudeState.display(for: task),
                                onEdit: editHandler(for: task),
                                onProposalNotice: { proposalNotice = $0 }
                            )
                                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                    Button(role: .destructive) {
                                        Task { await delete(task) }
                                    } label: {
                                        Label(L10n.delete, systemImage: "trash")
                                    }
                                    if task.status == "pending" {
                                        Button {
                                            editingTask = task
                                        } label: {
                                            Label(L10n.edit, systemImage: "pencil")
                                        }
                                        .tint(.blue)
                                    }
                                }
                        }
                    }
                    .listStyle(.plain)
                }
            }
        }
        .navigationTitle(L10n.aiTasks)
        .refreshable { await load() }
        .task { await load() }
        .task(id: shouldPoll) {
            guard shouldPoll else { return }
            await pollWhileClaudeWorks()
        }
        .sheet(item: $selectedDraftForReview) { draft in
            NavigationStack {
                AIMealReviewView(
                    estimate: MealEstimate(items: draft.items, source: draft.source),
                    date: draft.date,
                    mealType: draft.mealType ?? MealTiming.mealForCurrentTime(),
                    eatenAt: draft.eatenAt,
                    taskContext: AiTaskReviewContext(
                        taskId: draft.taskId,
                        pendingFoods: draft.pendingFoods,
                        source: draft.source,
                        clientEditedAt: store.tasks.first(where: { $0.id == draft.taskId })?.updatedAt
                    )
                ) { _ in
                    AiTaskDraftDisk.remove(taskId: draft.taskId)
                    readyForReviewDrafts.removeAll { $0.taskId == draft.taskId }
                    // Not a `store.refresh()`: the queued `.completeAiTask` op
                    // this just enqueued may not have uploaded yet, so the
                    // server would still answer "pending" — which would make
                    // `AiTaskProcessor` try to process this same task again.
                    // Dropping it from the in-memory list directly avoids
                    // that race; a later refresh picks up the real outcome.
                    store.markResolvedLocally(id: draft.taskId)
                    selectedDraftForReview = nil
                }
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(L10n.cancel) { selectedDraftForReview = nil }
                    }
                }
            }
        }
        .sheet(item: $editingTask) { task in
            AiTaskEditSheet(task: task) { _ in
                // The edit changed the description/photos/date/meal/time a
                // review-first draft was built from — `AiTaskStore.update`
                // already dropped the stale draft from disk, so drop it here
                // too rather than waiting for the next `load()` to notice.
                readyForReviewDrafts.removeAll { $0.taskId == task.id }
            }
        }
        .alert(
            L10n.error,
            isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
        ) {
            Button(L10n.ok, role: .cancel) {}
        } message: {
            if let errorMessage { Text(errorMessage) }
        }
        .alert(
            L10n.aiTasks,
            isPresented: .init(get: { proposalNotice != nil }, set: { if !$0 { proposalNotice = nil } })
        ) {
            Button(L10n.ok, role: .cancel) {}
        } message: {
            if let proposalNotice { Text(proposalNotice) }
        }
    }

    /// Opens the edit sheet for an open task, or nothing for a resolved one —
    /// completed/dismissed tasks stay read-only.
    private func editHandler(for task: AiTask) -> (() -> Void)? {
        guard task.status == "pending" else { return nil }
        return { editingTask = task }
    }

    private func delete(_ task: AiTask) async {
        do {
            try await store.delete(id: task.id)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// While Claude works on a pending task, re-reads the list every
    /// `pollInterval`. SwiftUI cancels this task when the view disappears and
    /// restarts it when `shouldPoll` flips (Claude work starts or ends, or the scene
    /// leaves the active phase).
    private func pollWhileClaudeWorks() async {
        while !Task.isCancelled, store.hasActiveClaudeWork {
            try? await Task.sleep(for: Self.pollInterval)
            guard !Task.isCancelled else { return }
            do {
                try await store.refresh()
                readyForReviewDrafts = AiTaskDraftDisk.loadAll()
                await store.acknowledgeAll(quiet: true)
            } catch {
                if Task.isCancelled { return }
                ErrorReporter.addBreadcrumb(
                    "AI task poll failed",
                    category: "ai-task",
                    level: .warning,
                    data: ["reason": ErrorReporter.reason(for: error)]
                )
            }
        }
    }

    private func load() async {
        error = nil
        isLoading = store.tasks.isEmpty
        await AiTaskNotifier.requestAuthorizationIfNeeded()
        do {
            try await store.refresh()
            readyForReviewDrafts = AiTaskDraftDisk.loadAll()
            // Show the tab holding what the user came here for. Arriving from a
            // dismissal notification would otherwise land on Open, which by
            // definition cannot contain the task they just tapped.
            if !hasChosenFilter, !store.unreadDismissals.isEmpty {
                selectedFilter = .dismissed
            }
            // Opening the list is what marks the outcomes as read — posting a
            // notification does not, so the user's other devices still get to tell them.
            await store.acknowledgeAll()
        } catch {
            if store.tasks.isEmpty { self.error = error }
        }
        isLoading = false
    }
}

/// A meal still on its way to the server, or one that never got there and can be
/// sent again without re-entering anything.
private struct PendingUploadRow: View {
    @Environment(AiTaskStore.self) private var store
    let upload: PendingAiTaskUpload

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                switch upload.state {
                case .sending:
                    ProgressView().controlSize(.small)
                    Text(L10n.aiTaskUploadSending)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                case .failed:
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                        .accessibilityHidden(true)
                    Text(L10n.aiTaskUploadFailedTitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Text(
                upload.description ?? (
                    upload.photoCount > 1
                        ? L10n.aiTasksPhotosOnly(upload.photoCount)
                        : L10n.aiTasksPhotoOnly
                )
            )
            .font(.body)
            if case let .failed(message, retryable) = upload.state {
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                if retryable {
                    Button(L10n.retry) { store.retryUpload(id: upload.id) }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

private struct AiTaskRow: View {
    let task: AiTask
    /// Claude's progress on a pending task, for the status chip.
    var claudeState: AiTaskClaudeState?
    /// Opens the edit sheet — `nil` for completed/dismissed tasks, which stay
    /// read-only.
    var onEdit: (() -> Void)?
    var onProposalNotice: (String) -> Void = { _ in }

    @State private var galleryIndex = 0
    @State private var showGallery = false

    /// Claude is checked first: it stores `processedBy` as `"assistant"`, which
    /// would otherwise read as the MCP assistant.
    private var processedByLabel: String? {
        guard task.status != "pending" else { return nil }
        if task.isProcessedByClaude { return L10n.aiTasksProcessedByClaude }
        return task.processedBy.flatMap { L10n.aiTasksProcessedBy($0) }
    }

    /// "2026-09-05 · 12:30 · Lunch", dropping whichever parts the task lacks.
    private var taskSubtitle: String {
        let time = task.eatenAt
            .flatMap { DateFormatting.isoDateTime(from: $0) }
            .map { DateFormatting.timeString(from: $0) }
        return [task.date, time, task.mealType].compactMap { $0 }.joined(separator: " · ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !task.photoUrls.isEmpty {
                photoStrip
            }
            textContent
            if let proposal = task.openProposal {
                ClaudeProposalCard(task: task, proposal: proposal, onNotice: onProposalNotice)
            }
        }
        .padding(.vertical, 4)
        .fullScreenCover(isPresented: $showGallery) {
            AiTaskImageViewer(imageUrls: task.photoUrls, initialIndex: galleryIndex) {
                showGallery = false
            }
        }
    }

    /// Subtitle, description and the assistant's comment — tappable to edit an
    /// open task. Kept separate from `photoStrip`, which holds its own
    /// per-photo buttons that a wrapping tap gesture would otherwise shadow.
    @ViewBuilder
    private var textContent: some View {
        let content = VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text(taskSubtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if task.isUnreadDismissal {
                    Text(L10n.aiTasksUnread)
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.accentColor.opacity(0.15))
                        .clipShape(Capsule())
                }
            }

            if let description = task.description, !description.isEmpty {
                Text(description).font(.body)
            } else if !task.photoUrls.isEmpty {
                Text(
                    task.photoUrls.count > 1
                        ? L10n.aiTasksPhotosOnly(task.photoUrls.count)
                        : L10n.aiTasksPhotoOnly
                )
                .font(.body)
                .italic()
                .foregroundStyle(.secondary)
            }

            if let claudeState, !(claudeState == .proposed && task.openProposal != nil) {
                ClaudeStateChip(state: claudeState)
            }

            // The assistant's own words. On a dismissal this is the whole point of the
            // screen — it says why the meal was not logged — so it gets a real surface
            // rather than a muted caption.
            if let summary = task.resultSummary, !summary.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text(L10n.aiTasksAgentComment)
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(.secondary)
                    Text(summary).font(.footnote)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(10)
                .background(Color.secondary.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }

            // Who resolved this — only ever set once the task leaves pending,
            // mirroring the web `AiTaskCard`'s own label.
            if let label = processedByLabel {
                Text(label)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }

        if let onEdit {
            content
                .contentShape(Rectangle())
                .onTapGesture { onEdit() }
                // A bare onTapGesture is invisible to VoiceOver — expose it as
                // a real action instead of relying on the gesture.
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isButton)
                .accessibilityAction { onEdit() }
        } else {
            content
        }
    }

    /// Every photo of the meal, in a row — not just the first with a "+N"
    /// badge — so the user can check any of them against what the assistant
    /// read without leaving the list. Tapping one opens it full screen.
    private var photoStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Array(task.photoUrls.enumerated()), id: \.offset) { index, url in
                    Button {
                        galleryIndex = index
                        showGallery = true
                    } label: {
                        FoodImageView(imageUrl: url)
                            .frame(width: 64, height: 64)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L10n.aiTasksPhotoIndex(index + 1, task.photoUrls.count))
                }
            }
        }
    }
}

/// A meal `AiTaskProcessor` (this iPhone, in review-first mode) has already
/// read but not logged yet — tapping opens `AIMealReviewView` to confirm or
/// edit it, mirroring `AiTaskRow`'s layout.
private struct ReadyForReviewRow: View {
    let draft: ProcessedAiTaskDraft

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: "sparkles")
                    .foregroundStyle(.blue)
                    .accessibilityHidden(true)
                Text(L10n.aiTaskProcessorReadyForReview)
                    .font(.caption2.weight(.semibold))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.blue.opacity(0.15))
                    .clipShape(Capsule())
            }
            Text(draft.items.map(\.name).joined(separator: ", "))
                .font(.body)
                .foregroundStyle(.primary)
            Text(L10n.aiTaskProcessorReviewHint)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }
}

private struct ClaudeStateChip: View {
    let state: AiTaskClaudeState

    private var tint: Color {
        state == .blocked ? .orange : .blue
    }

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: state == .blocked ? "exclamationmark.triangle.fill" : "sparkles")
                .accessibilityHidden(true)
            Text(L10n.aiTasksClaudeState(state))
        }
        .font(.caption2.weight(.semibold))
        .foregroundStyle(tint)
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(tint.opacity(0.15))
        .clipShape(Capsule())
    }
}

/// Claude's suggested entries for a pending task: every item starts selected,
/// "Log selected" sends the selection to the accept endpoint, "Discard"
/// dismisses the task. A failed accept keeps the selection so it can be retried.
private struct ClaudeProposalCard: View {
    @Environment(AiTaskStore.self) private var store

    let task: AiTask
    let proposal: AiTaskProposal
    let onNotice: (String) -> Void

    @State private var storedSelection: Set<String>
    @State private var seen: Set<String>
    @State private var isWorking = false
    @State private var inlineMessage: String?

    init(task: AiTask, proposal: AiTaskProposal, onNotice: @escaping (String) -> Void) {
        self.task = task
        self.proposal = proposal
        self.onNotice = onNotice
        _storedSelection = State(initialValue: Set(proposal.items.map(\.id)))
        _seen = State(initialValue: Set(proposal.items.map(\.id)))
    }

    /// Reconciled against the proposal on every render, so a regenerated
    /// proposal never shows a frame with the old selection.
    private var current: (selected: Set<String>, seen: Set<String>) {
        AiTaskProposalSelection.reconciled(
            selected: storedSelection, seen: seen, ids: proposal.items.map(\.id)
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(L10n.aiTasksProposalTitle)
                .font(.caption.weight(.semibold))
            if let summary = proposal.summary, !summary.isEmpty {
                Text(summary)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            ForEach(proposal.items) { item in
                itemRow(item)
            }
            if let inlineMessage {
                Text(inlineMessage)
                    .font(.footnote)
                    .foregroundStyle(.red)
            }
            HStack(spacing: 8) {
                Button(role: .destructive) {
                    Task { await discard() }
                } label: {
                    Text(L10n.aiTasksProposalDiscard).frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                Button {
                    Task { await accept() }
                } label: {
                    Text(L10n.aiTasksProposalLog).frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
            }
            .disabled(isWorking)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color.blue.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .onChange(of: proposal.items.map(\.id)) {
            storedSelection = current.selected
            seen = current.seen
        }
    }

    private func itemRow(_ item: AiTaskProposalItem) -> some View {
        let isSelected = current.selected.contains(item.id)
        return Button {
            let reconciled = current
            storedSelection = AiTaskProposalSelection.toggled(item.id, in: reconciled.selected)
            seen = reconciled.seen
            inlineMessage = nil
        } label: {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isSelected ? Color.accentColor : Color.secondary)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.name).font(.subheadline)
                    if item.newFood != nil {
                        Text(L10n.aiTasksProposalNewFood)
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(Color.accentColor)
                    }
                    if let quantity = item.quantityDescription, !quantity.isEmpty {
                        Text(quantity).font(.caption).foregroundStyle(.secondary)
                    }
                    macroLine(item)
                }
                Spacer(minLength: 0)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private func macroLine(_ item: AiTaskProposalItem) -> some View {
        HStack(spacing: 6) {
            Text("\(AiTaskProposalSelection.format(item.calories)) kcal").foregroundStyle(MacroColors.calories)
            Text("\(AiTaskProposalSelection.format(item.protein))P").foregroundStyle(MacroColors.protein)
            Text("\(AiTaskProposalSelection.format(item.carbs))C").foregroundStyle(MacroColors.carbs)
            Text("\(AiTaskProposalSelection.format(item.fat))F").foregroundStyle(MacroColors.fat)
            Text("\(AiTaskProposalSelection.format(item.fiber)) Fi").foregroundStyle(MacroColors.fiber)
        }
        .font(.caption2.monospacedDigit())
    }

    private func accept() async {
        let ids = AiTaskProposalSelection.itemIds(items: proposal.items, selected: current.selected)
        guard !ids.isEmpty else {
            inlineMessage = L10n.aiTasksProposalNoneSelected
            return
        }
        inlineMessage = nil
        isWorking = true
        defer { isWorking = false }
        switch await store.acceptProposal(id: task.id, itemIds: ids) {
        case .logged: onNotice(L10n.aiTasksProposalLogged)
        case .conflict: onNotice(L10n.aiTasksProposalAcceptConflict)
        case .failed: inlineMessage = L10n.aiTasksProposalAcceptFailed
        }
    }

    private func discard() async {
        inlineMessage = nil
        isWorking = true
        defer { isWorking = false }
        do {
            try await store.update(id: task.id, AiTaskUpdate(status: "dismissed"))
        } catch {
            ErrorReporter.captureWarning("Proposal discard failed", context: ["reason": ErrorReporter.reason(for: error)])
            inlineMessage = L10n.somethingWentWrong
        }
    }
}
