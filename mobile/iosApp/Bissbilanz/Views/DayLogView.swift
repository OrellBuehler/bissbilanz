import SwiftUI

struct DayLogView: View {
    @Environment(EntryRepository.self) private var entryRepository
    let date: String

    @State private var entries: [Entry] = []
    @State private var isLoading = true
    @State private var error: Error?
    @State private var showFoodSearch = false
    @State private var editingEntry: Entry?
    @State private var isCopying = false
    @State private var showQuickEntry = false
    @State private var showAIMeal = false
    @State private var errorMessage: String?
    @State private var searchText = ""

    /// Entries narrowed by the search field (matches the displayed name).
    private var filteredEntries: [Entry] {
        guard !searchText.isEmpty else { return entries }
        return entries.filter { $0.displayName.localizedCaseInsensitiveContains(searchText) }
    }

    private var mealGroups: [(String, [Entry])] {
        MealGrouping.group(filteredEntries)
    }

    /// Logged-time order within a meal; entries without a timestamp sort last.
    private func sortedByTime(_ items: [Entry]) -> [Entry] {
        items.sorted { ($0.loggedAt ?? .distantFuture) < ($1.loggedAt ?? .distantFuture) }
    }

    var body: some View {
        Group {
            if isLoading {
                LoadingView()
            } else if let error {
                ErrorView(error: error) { Task { await loadEntries() } }
            } else if entries.isEmpty {
                emptyView
            } else {
                entryList
            }
        }
        .navigationTitle(displayDate)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button {
                    showAIMeal = true
                } label: {
                    Image(systemName: "sparkles")
                }
                .accessibilityLabel(L10n.aiMealEstimate)

                Button {
                    Task { await copyYesterday() }
                } label: {
                    Image(systemName: "doc.on.doc")
                }
                .disabled(isCopying)
                .accessibilityLabel(L10n.copyYesterday)

                Button {
                    showQuickEntry = true
                } label: {
                    Image(systemName: "pencil")
                }
                .accessibilityLabel(L10n.quickEntry)

                Button {
                    showFoodSearch = true
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel(L10n.addFood)
            }
        }
        .refreshable { await loadEntries() }
        .sheet(isPresented: $showFoodSearch) {
            NavigationStack {
                FoodSearchView(date: date)
            }
            .onDisappear {
                Task { await loadEntries() }
            }
        }
        .sheet(isPresented: $showQuickEntry) {
            QuickEntrySheet(date: date) {
                Task { await loadEntries() }
            }
        }
        .sheet(isPresented: $showAIMeal) {
            AIMealSheet(date: date) { _ in
                Task { await loadEntries() }
            }
        }
        .sheet(item: $editingEntry) { entry in
            // PATCH responses are raw DB rows without resolved macros — reload instead
            EntryEditSheet(entry: entry) { _ in
                Task { await loadEntries() }
            }
        }
        .task { await loadEntries(showSpinner: true) }
        .alert(L10n.error, isPresented: .init(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
            Button(L10n.ok, role: .cancel) {}
        } message: {
            if let errorMessage { Text(errorMessage) }
        }
    }

    private var displayDate: String {
        if let parsed = DateFormatting.date(from: date) {
            if parsed.isToday {
                return L10n.today
            }
            return DateFormatting.displayString(from: parsed)
        }
        return date
    }

    private var emptyView: some View {
        ContentUnavailableView {
            Label(L10n.noEntries, systemImage: "tray")
        } description: {
            Text(L10n.noEntriesYet)
        } actions: {
            VStack(spacing: 12) {
                Button {
                    showFoodSearch = true
                } label: {
                    Label(L10n.addFood, systemImage: "plus.circle.fill")
                }
                .buttonStyle(.borderedProminent)

                Button {
                    Task { await copyYesterday() }
                } label: {
                    Label(L10n.copyYesterday, systemImage: "doc.on.doc")
                }
                .buttonStyle(.bordered)
                .disabled(isCopying)
            }
        }
    }

    private var entryList: some View {
        List {
            ForEach(mealGroups, id: \.0) { mealType, mealEntries in
                Section {
                    ForEach(sortedByTime(mealEntries)) { entry in
                        entryRow(entry)
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                Button(role: .destructive) {
                                    Task { await deleteEntry(entry) }
                                } label: {
                                    Label(L10n.delete, systemImage: "trash")
                                }
                            }
                            .swipeActions(edge: .leading) {
                                Button {
                                    editingEntry = entry
                                } label: {
                                    Label(L10n.edit, systemImage: "pencil")
                                }
                                .tint(.blue)
                            }
                    }
                } header: {
                    mealHeader(mealType, mealEntries)
                }
            }
        }
        .listStyle(.insetGrouped)
        .searchable(text: $searchText, prompt: L10n.search)
        .overlay {
            if mealGroups.isEmpty, !searchText.isEmpty {
                ContentUnavailableView.search(text: searchText)
            }
        }
    }

    /// Meal section header: the meal name with the per-meal totals as compact,
    /// quietly tinted pills instead of a row of bright coloured numbers.
    private func mealHeader(_ mealType: String, _ mealEntries: [Entry]) -> some View {
        let cal = mealEntries.reduce(0.0) { $0 + $1.totalCalories }
        let p = mealEntries.reduce(0.0) { $0 + $1.totalProtein }
        let c = mealEntries.reduce(0.0) { $0 + $1.totalCarbs }
        let f = mealEntries.reduce(0.0) { $0 + $1.totalFat }
        return VStack(alignment: .leading, spacing: 6) {
            Text(L10n.mealName(mealType))
            HStack(spacing: 6) {
                MacroPill(value: "\(Int(cal)) cal", color: MacroColors.calories)
                MacroPill(label: "P", value: "\(Int(p))g", color: MacroColors.protein)
                MacroPill(label: "C", value: "\(Int(c))g", color: MacroColors.carbs)
                MacroPill(label: "F", value: "\(Int(f))g", color: MacroColors.fat)
            }
        }
    }

    private func entryRow(_ entry: Entry) -> some View {
        Button {
            editingEntry = entry
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(entry.displayName)
                        .font(.body)
                        .foregroundStyle(.primary)
                    HStack(spacing: 5) {
                        if let time = entry.loggedTimeString {
                            Text(time)
                            Text("\u{00B7}")
                        }
                        Text("\(entry.servings, specifier: "%.2g")x \u{00B7} \(Int(entry.totalCalories)) cal")
                    }
                    .font(.caption)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
                }
                Spacer()
                // Neutral, single-line macro summary — the colour now lives only
                // in the meal-header pills, so the list reads calmly.
                Text("P\(Int(entry.totalProtein)) C\(Int(entry.totalCarbs)) F\(Int(entry.totalFat))")
                    .font(.caption2)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
        }
        // List otherwise tints Button labels with the accent color, overriding
        // the explicit .primary/.secondary colors set above.
        .buttonStyle(.plain)
    }

    private func loadEntries(showSpinner: Bool = false) async {
        entries = entryRepository.entries(date: date)
        if showSpinner { isLoading = entries.isEmpty }
        error = nil
        do {
            try await entryRepository.refresh(date: date)
            entries = entryRepository.entries(date: date)
        } catch {
            // Local data still renders — only block the screen when there is none.
            if entries.isEmpty { self.error = error }
        }
        isLoading = false
    }

    private func deleteEntry(_ entry: Entry) async {
        do {
            try await entryRepository.deleteEntry(id: entry.id)
        } catch {
            errorMessage = error.localizedDescription
        }
        withAnimation { entries = entryRepository.entries(date: date) }
    }

    private func copyYesterday() async {
        isCopying = true
        let viewedDate = DateFormatting.date(from: date) ?? Date()
        let yesterday = viewedDate.adding(days: -1).isoDateString
        do {
            try await entryRepository.copyEntries(fromDate: yesterday, toDate: date)
            withAnimation { entries = entryRepository.entries(date: date) }
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        } catch {
            errorMessage = error.localizedDescription
        }
        isCopying = false
    }
}

/// A compact, quietly tinted capsule for a single macro total — used in the
/// day-log meal headers to replace the row of bright coloured numbers.
private struct MacroPill: View {
    var label: String = ""
    let value: String
    let color: Color

    var body: some View {
        HStack(spacing: 3) {
            if !label.isEmpty {
                Text(label).fontWeight(.semibold)
            }
            Text(value).monospacedDigit()
        }
        .font(.caption2)
        .foregroundStyle(color)
        .padding(.horizontal, 7)
        .padding(.vertical, 3)
        .background(color.opacity(0.16), in: Capsule())
    }
}
