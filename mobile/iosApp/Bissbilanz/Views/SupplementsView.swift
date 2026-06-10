import SwiftUI

struct SupplementsView: View {
    @Environment(SupplementRepository.self) private var supplementRepository

    @State private var supplements: [Supplement] = []
    @State private var loggedIds: Set<String> = []
    @State private var isLoading = true
    @State private var showCreateSheet = false
    @State private var editingSupplement: Supplement?
    @State private var expandedIds: Set<String> = []
    @State private var errorMessage: String?

    private var takenCount: Int {
        loggedIds.count
    }

    private var totalCount: Int {
        supplements.filter(\.isActive).count
    }

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
            .alert(
                L10n.error,
                isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
            ) {
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

    // MARK: - Supplements Sections

    private var activeSupplements: [Supplement] {
        supplements.filter(\.isActive)
    }

    private var inactiveSupplements: [Supplement] {
        supplements.filter { !$0.isActive }
    }

    private var supplementsSection: some View {
        Group {
            if !activeSupplements.isEmpty {
                Section {
                    ForEach(activeSupplements) { supplement in
                        supplementRowWithSwipe(supplement)
                    }
                }
            }

            if !inactiveSupplements.isEmpty {
                Section(L10n.inactive) {
                    ForEach(inactiveSupplements) { supplement in
                        supplementRowWithSwipe(supplement)
                    }
                }
            }
        }
    }

    private func supplementRowWithSwipe(_ supplement: Supplement) -> some View {
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

    private func supplementRow(_ supplement: Supplement) -> some View {
        let isTaken = loggedIds.contains(supplement.id)
        let isExpanded = expandedIds.contains(supplement.id)
        let hasIngredients = supplement.ingredients.count > 1

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
                        Text(dosageSummary(supplement))
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

            if isExpanded, !supplement.ingredients.isEmpty {
                Divider()
                    .padding(.vertical, 6)

                VStack(alignment: .leading, spacing: 4) {
                    Text(L10n.ingredients)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .textCase(.uppercase)

                    ForEach(supplement.ingredients) { ingredient in
                        HStack {
                            Text(ingredient.food.name)
                                .font(.caption)
                                .foregroundStyle(.primary)
                            Spacer()
                            Text(ingredient.food.ingredientsText ?? "")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .padding(.leading, 44)
            }
        }
    }

    private func dosageSummary(_ supplement: Supplement) -> String {
        let ings = supplement.ingredients
        switch ings.count {
        case 0: return ""
        case 1: return ings[0].food.ingredientsText ?? ""
        default: return "\(ings.count) ingredients"
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
        case "morning": L10n.morning
        case "evening", "night": L10n.evening
        case "noon", "afternoon": L10n.noon
        case "anytime": L10n.anytime
        default: time.capitalized
        }
    }

    private func timeIcon(_ time: String) -> String {
        switch time.lowercased() {
        case "morning": "sunrise"
        case "evening", "night": "moon"
        case "noon", "afternoon": "sun.max"
        default: "clock"
        }
    }

    // MARK: - Actions

    private func toggleSupplement(_ supplement: Supplement, isTaken: Bool) async {
        let dateString = DateFormatting.today
        do {
            if isTaken {
                try await supplementRepository.unlogSupplement(id: supplement.id, date: dateString)
            } else {
                try await supplementRepository.logSupplement(id: supplement.id, date: dateString)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        loggedIds = supplementRepository.loggedSupplementIds(date: dateString)
    }

    private func deleteSupplement(_ supplement: Supplement) async {
        do {
            try await supplementRepository.deleteSupplement(id: supplement.id)
        } catch {
            errorMessage = error.localizedDescription
        }
        supplements = supplementRepository.supplements()
        loggedIds.remove(supplement.id)
    }

    private func loadData() async {
        let dateString = DateFormatting.today
        supplements = supplementRepository.supplements()
        loggedIds = supplementRepository.loggedSupplementIds(date: dateString)
        isLoading = supplements.isEmpty
        do {
            try await supplementRepository.refresh()
            supplements = supplementRepository.supplements()
        } catch {
            if supplements.isEmpty {
                errorMessage = error.localizedDescription
            }
        }
        if let checklist = try? await supplementRepository.refreshChecklist(date: dateString) {
            loggedIds = Set(checklist.filter(\.taken).map(\.supplement.id))
        }
        isLoading = false
    }
}
