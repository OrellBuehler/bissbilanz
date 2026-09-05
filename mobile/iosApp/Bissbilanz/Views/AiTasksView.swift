import SwiftUI

struct AiTasksView: View {
    @Environment(AiTaskStore.self) private var store

    @State private var isLoading = true
    @State private var error: Error?
    @State private var selectedFilter: Filter = .open
    @State private var hasChosenFilter = false
    @State private var errorMessage: String?

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

    private var visibleTasks: [AiTask] {
        store.tasks.filter { $0.status == selectedFilter.status }
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
                } else if visibleTasks.isEmpty {
                    ContentUnavailableView(
                        L10n.aiTasks,
                        systemImage: "sparkles",
                        description: Text(selectedFilter.emptyMessage)
                    )
                } else {
                    List(visibleTasks) { task in
                        AiTaskRow(task: task)
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) {
                                    Task { await delete(task) }
                                } label: {
                                    Label(L10n.delete, systemImage: "trash")
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
        .alert(
            L10n.error,
            isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
        ) {
            Button(L10n.ok, role: .cancel) {}
        } message: {
            if let errorMessage { Text(errorMessage) }
        }
    }

    private func delete(_ task: AiTask) async {
        do {
            try await store.delete(id: task.id)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func load() async {
        error = nil
        isLoading = store.tasks.isEmpty
        await AiTaskNotifier.requestAuthorizationIfNeeded()
        do {
            try await store.refresh()
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

private struct AiTaskRow: View {
    let task: AiTask

    /// "2026-09-05 · 12:30 · Lunch", dropping whichever parts the task lacks.
    private var taskSubtitle: String {
        let time = task.eatenAt
            .flatMap { DateFormatting.isoDateTime(from: $0) }
            .map { DateFormatting.timeString(from: $0) }
        return [task.date, time, task.mealType].compactMap { $0 }.joined(separator: " · ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 12) {
                if let photoUrl = task.photoUrls.first {
                    ZStack(alignment: .bottomTrailing) {
                        AsyncImage(url: BissbilanzAPI.absoluteURL(for: photoUrl)) { image in
                            image.resizable().aspectRatio(contentMode: .fill)
                        } placeholder: {
                            Color.secondary.opacity(0.15)
                        }
                        .frame(width: 56, height: 56)
                        .clipShape(RoundedRectangle(cornerRadius: 8))

                        if task.photoUrls.count > 1 {
                            Text("+\(task.photoUrls.count - 1)")
                                .font(.caption2.weight(.semibold))
                                .padding(.horizontal, 4)
                                .padding(.vertical, 1)
                                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 4))
                                .padding(3)
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 2) {
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
                    } else {
                        Text(
                            task.photoUrls.count > 1
                                ? L10n.aiTasksPhotosOnly(task.photoUrls.count)
                                : L10n.aiTasksPhotoOnly
                        )
                        .font(.body)
                        .italic()
                        .foregroundStyle(.secondary)
                    }
                }
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
        }
        .padding(.vertical, 4)
    }
}
