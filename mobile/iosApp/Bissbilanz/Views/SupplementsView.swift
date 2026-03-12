import SwiftUI

struct SupplementsView: View {
    @Environment(BissbilanzAPI.self) private var api

    @State private var supplements: [Supplement] = []
    @State private var loggedIds: Set<String> = []
    @State private var isLoading = true
    @State private var showCreateSheet = false
    @State private var editingSupplement: Supplement?
    @State private var expandedIds: Set<String> = []
    @State private var errorMessage: String?

    private var takenCount: Int { loggedIds.count }
    private var totalCount: Int { supplements.count }
    private var progress: Double {
        guard totalCount > 0 else { return 0 }
        return Double(takenCount) / Double(totalCount)
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    LoadingView()
                } else if supplements.isEmpty {
                    ContentUnavailableView(
                        L10n.supplements,
                        systemImage: "pills",
                        description: Text(L10n.noEntriesYet)
                    )
                } else {
                    List {
                        progressSection

                        supplementsSection
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .navigationTitle(L10n.supplements)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    HStack(spacing: 12) {
                        NavigationLink {
                            SupplementHistoryView()
                        } label: {
                            Image(systemName: "clock.arrow.circlepath")
                        }

                        Button {
                            showCreateSheet = true
                        } label: {
                            Image(systemName: "plus")
                        }
                    }
                }
            }
            .sheet(isPresented: $showCreateSheet) {
                SupplementEditSheet { _ in
                    Task { await loadData() }
                }
            }
            .sheet(item: $editingSupplement) { supplement in
                SupplementEditSheet(supplement: supplement) { _ in
                    Task { await loadData() }
                }
            }
            .refreshable { await loadData() }
            .task { await loadData() }
            .alert(L10n.error, isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
                Button(L10n.ok, role: .cancel) {}
            } message: {
                if let errorMessage { Text(errorMessage) }
            }
        }
    }

    // MARK: - Progress Section

    private var progressSection: some View {
        Section {
            VStack(spacing: 8) {
                HStack {
                    Text(L10n.today)
                        .font(.headline)
                    Spacer()
                    Text("\(takenCount)/\(totalCount)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                ProgressView(value: progress)
                    .tint(progress >= 1.0 ? .green : .accentColor)
            }
            .padding(.vertical, 4)
        }
    }

    // MARK: - Supplements Section

    private var supplementsSection: some View {
        Section {
            ForEach(supplements) { supplement in
                supplementRow(supplement)
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button(role: .destructive) {
                            Task { await deleteSupplement(supplement) }
                        } label: {
                            Label(L10n.delete, systemImage: "trash")
                        }

                        Button {
                            editingSupplement = supplement
                        } label: {
                            Label(L10n.edit, systemImage: "pencil")
                        }
                        .tint(.orange)
                    }
            }
        }
    }

    private func supplementRow(_ supplement: Supplement) -> some View {
        let isTaken = loggedIds.contains(supplement.id)
        let isExpanded = expandedIds.contains(supplement.id)
        let hasIngredients = supplement.ingredients != nil && !(supplement.ingredients?.isEmpty ?? true)

        return VStack(alignment: .leading, spacing: 0) {
            Button {
                Task {
                    await toggleSupplement(supplement, isTaken: isTaken)
                }
            } label: {
                HStack {
                    Image(systemName: isTaken ? "checkmark.circle.fill" : "circle")
                        .font(.title2)
                        .foregroundStyle(isTaken ? .green : .secondary)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(supplement.name)
                            .font(.body)
                            .foregroundStyle(.primary)
                            .strikethrough(isTaken)
                        Text("\(supplement.dosage, specifier: "%.0f") \(supplement.dosageUnit)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if let time = supplement.timeOfDay {
                            Label(timeOfDayLabel(time), systemImage: timeIcon(time))
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                        }
                    }

                    Spacer()

                    VStack(alignment: .trailing, spacing: 4) {
                        scheduleLabel(supplement)

                        if hasIngredients {
                            Button {
                                withAnimation {
                                    if isExpanded {
                                        expandedIds.remove(supplement.id)
                                    } else {
                                        expandedIds.insert(supplement.id)
                                    }
                                }
                            } label: {
                                Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .buttonStyle(.plain)

            if isExpanded, let ingredients = supplement.ingredients, !ingredients.isEmpty {
                Divider()
                    .padding(.vertical, 6)

                VStack(alignment: .leading, spacing: 4) {
                    Text(L10n.ingredients)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .textCase(.uppercase)

                    ForEach(ingredients) { ingredient in
                        HStack {
                            Text(ingredient.name)
                                .font(.caption)
                                .foregroundStyle(.primary)
                            Spacer()
                            Text("\(ingredient.dosage, specifier: "%.0f") \(ingredient.dosageUnit)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .padding(.leading, 44)
            }
        }
    }

    private func scheduleLabel(_ supplement: Supplement) -> some View {
        Group {
            switch supplement.scheduleType {
            case .daily:
                Text(L10n.daily)
            case .everyOtherDay:
                Text(L10n.everyOtherDay)
            case .weekly:
                Text(L10n.weekly)
            case .specificDays:
                Text(L10n.custom)
            }
        }
        .font(.caption2)
        .foregroundStyle(.tertiary)
    }

    private func timeOfDayLabel(_ time: String) -> String {
        switch time.lowercased() {
        case "morning": return L10n.morning
        case "evening", "night": return L10n.evening
        case "noon", "afternoon": return L10n.noon
        case "anytime": return L10n.anytime
        default: return time.capitalized
        }
    }

    private func timeIcon(_ time: String) -> String {
        switch time.lowercased() {
        case "morning": return "sunrise"
        case "evening", "night": return "moon"
        case "noon", "afternoon": return "sun.max"
        default: return "clock"
        }
    }

    // MARK: - Actions

    private func toggleSupplement(_ supplement: Supplement, isTaken: Bool) async {
        let dateString = DateFormatting.today
        if isTaken {
            do {
                try await api.unlogSupplement(id: supplement.id, date: dateString)
                loggedIds.remove(supplement.id)
            } catch {
                errorMessage = error.localizedDescription
            }
        } else {
            do {
                _ = try await api.logSupplement(id: supplement.id, date: dateString)
                loggedIds.insert(supplement.id)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func deleteSupplement(_ supplement: Supplement) async {
        do {
            try await api.deleteSupplement(id: supplement.id)
            supplements.removeAll { $0.id == supplement.id }
            loggedIds.remove(supplement.id)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadData() async {
        isLoading = true
        let dateString = DateFormatting.today
        do {
            supplements = try await api.getSupplements()
            let checklist = try await api.getSupplementChecklist(date: dateString)
            loggedIds = Set(checklist.filter(\.taken).map(\.supplement.id))
        } catch {
            if supplements.isEmpty {
                do {
                    supplements = try await api.getSupplements()
                } catch {}
            }
        }
        isLoading = false
    }
}
